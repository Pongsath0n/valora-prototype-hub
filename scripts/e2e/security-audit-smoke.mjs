#!/usr/bin/env node
import process from "node:process";

import {
  ENV,
  maskedEnvSummary,
  assertLocalFirstUnlessCloud,
  ensureEnvVars,
} from "./env.mjs";
import { resolveProductFixture } from "./product-fixture.mjs";

const {
  backendUrl: BACKEND_URL,
  ownerToken: OWNER_TOKEN,
  staffToken: STAFF_TOKEN,
  storeId: STORE_ID,
} = ENV;

const summary = {
  script: "security-audit-smoke",
  backend_url: BACKEND_URL,
  store_id: STORE_ID,
  env: maskedEnvSummary(),
  order: {},
  product: null,
  checks: {},
  failures: [],
  result: "pending",
};

let PRODUCT_FIXTURE = null;
let RESOLVED_STORE_ID = STORE_ID || "";

function record(name, status, detail = {}) {
  summary.checks[name] = { status, ...detail };
}

function fail(name, message, detail = {}) {
  summary.failures.push({ name, message, detail });
  record(name, "fail", detail);
  finish(false, message);
}

function finish(ok, message) {
  summary.result = ok ? "pass" : "fail";
  if (message) summary.message = message;
  console.log(JSON.stringify(summary, null, 2));
  process.exit(ok ? 0 : 1);
}

async function fetchJson(url, init = {}) {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: null, body: { error: error.message } };
  }
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function withStoreId(path) {
  const targetStoreId = RESOLVED_STORE_ID || STORE_ID;
  if (!targetStoreId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}store_id=${encodeURIComponent(targetStoreId)}`;
}

async function ensureProductFixture() {
  if (PRODUCT_FIXTURE) {
    return PRODUCT_FIXTURE;
  }
  try {
    const fixture = await resolveProductFixture({
      backendUrl: BACKEND_URL,
      storeId: RESOLVED_STORE_ID || undefined,
    });
    PRODUCT_FIXTURE = fixture;
    if (!RESOLVED_STORE_ID && fixture.storeId) {
      RESOLVED_STORE_ID = fixture.storeId;
    }
    summary.product = {
      id: fixture.productId,
      name: fixture.productName,
      store_id: RESOLVED_STORE_ID || fixture.storeId || null,
    };
    if (!summary.store_id && (RESOLVED_STORE_ID || fixture.storeId)) {
      summary.store_id = RESOLVED_STORE_ID || fixture.storeId;
    }
    return PRODUCT_FIXTURE;
  } catch (error) {
    fail("product_fixture", error.message || "product_fixture_failed", error.detail || {});
  }
}

function findOrderLogs(data, orderId) {
  if (!data) return [];
  const buckets = data.buckets || {};
  const combined = Array.isArray(data.items) ? data.items : [];
  const candidates = [
    ...(Array.isArray(buckets.orders) ? buckets.orders : []),
    ...combined,
  ];
  return candidates.filter((entry) => entry && entry.order_id === orderId);
}

async function ownerAuditRequest(limit = 50) {
  const resp = await fetchJson(`${BACKEND_URL}/api/system/audit-logs?limit=${limit}`, {
    headers: auth(OWNER_TOKEN),
  });
  if (!resp.ok) {
    fail("audit_owner_fetch", "Owner audit log fetch failed", { status: resp.status, body: resp.body });
  }
  return resp;
}

async function verifyAuditEndpointAccess() {
  const ownerResp = await ownerAuditRequest(5);
  record("audit_owner_access", "pass", { status: ownerResp.status, total: ownerResp.body?.items?.length || 0 });

  const staffResp = await fetchJson(`${BACKEND_URL}/api/system/audit-logs`, {
    headers: auth(STAFF_TOKEN),
  });
  if (staffResp.status !== 403) {
    fail("audit_staff_forbidden", "Staff should be forbidden from /api/system/audit-logs", {
      status: staffResp.status,
      body: staffResp.body,
    });
  }
  record("audit_staff_forbidden", "pass", { status: staffResp.status });

  const unauthResp = await fetchJson(`${BACKEND_URL}/api/system/audit-logs`);
  if (![401, 403].includes(unauthResp.status)) {
    fail("audit_unauth_blocked", "Unauthenticated audit log request should be denied", {
      status: unauthResp.status,
      body: unauthResp.body,
    });
  }
  record("audit_unauth_blocked", "pass", { status: unauthResp.status });
}

async function verifyChannelRoleGate() {
  const ownerResp = await fetchJson(`${BACKEND_URL}${withStoreId("/api/store-admin/channels")}`, {
    headers: auth(OWNER_TOKEN),
  });
  if (!ownerResp.ok) {
    fail("channels_owner_access", "Owner/manager should be able to list channels", {
      status: ownerResp.status,
      body: ownerResp.body,
    });
  }
  record("channels_owner_access", "pass", { count: ownerResp.body?.items?.length || 0 });

  const staffResp = await fetchJson(`${BACKEND_URL}${withStoreId("/api/store-admin/channels")}`, {
    headers: auth(STAFF_TOKEN),
  });
  if (staffResp.status !== 403) {
    fail("channels_staff_blocked", "Staff must be denied from /api/store-admin/channels", {
      status: staffResp.status,
      body: staffResp.body,
    });
  }
  record("channels_staff_blocked", "pass", { status: staffResp.status });
}

async function createCustomerOrder() {
  const fixture = await ensureProductFixture();
  const payload = {
    customer: {
      name: "Security Audit",
      phone: `099${Date.now().toString().slice(-7)}`,
      line_user_id: "U_security_audit",
    },
    items: [{ product_id: fixture.productId, quantity: 1 }],
    pickup_time: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    note: "security-audit-smoke",
    store_id: RESOLVED_STORE_ID || fixture.storeId || undefined,
  };

  const resp = await fetchJson(`${BACKEND_URL}/api/customer/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    fail("customer_order_create", "Failed to create customer order", { status: resp.status, body: resp.body });
  }

  const order = resp.body || {};
  summary.order = {
    id: order.order_id,
    order_no: order.order_no || order.order_number,
    public_token: order.public_token,
  };
  record("customer_order_create", "pass", summary.order);
  return summary.order;
}

async function verifyOrderTokenGuards(order) {
  const baseUrl = `${BACKEND_URL}/api/customer/orders/${order.id}`;

  const noToken = await fetchJson(baseUrl);
  if (noToken.status !== 403) {
    fail("customer_order_token_required", "Missing token should be rejected", { status: noToken.status, body: noToken.body });
  }
  record("customer_order_token_required", "pass", { status: noToken.status });

  const wrongToken = await fetchJson(`${baseUrl}?token=wrong-token`);
  if (wrongToken.status !== 403) {
    fail("customer_order_token_invalid", "Wrong token should be rejected", {
      status: wrongToken.status,
      body: wrongToken.body,
    });
  }
  record("customer_order_token_invalid", "pass", { status: wrongToken.status });

  const validResp = await fetchJson(`${baseUrl}?token=${encodeURIComponent(order.public_token)}`);
  if (!validResp.ok || validResp.body?.order_id !== order.id) {
    fail("customer_order_token_valid", "Valid token should return order summary", {
      status: validResp.status,
      body: validResp.body,
    });
  }
  record("customer_order_token_valid", "pass", { status: validResp.status });
}

function verifyOrderNumberFormat(order) {
  const orderNo = order.order_no || "";
  const sequentialPattern = /^ORD-\d{5,}$/;
  const legacyPattern = /^ORD-\d{14}-[A-Z0-9]{4}$/;
  if (!sequentialPattern.test(orderNo) || legacyPattern.test(orderNo)) {
    fail("order_number_format", "Order number did not match ORD-00001 style", { order_no: orderNo });
  }
  record("order_number_format", "pass", { order_no: orderNo });
}

async function verifyInitialAuditLog(order) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const auditResp = await ownerAuditRequest(100);
  const logs = findOrderLogs(auditResp.body, order.id);
  const log = logs[0];
  if (!log) {
    fail("order_initial_log", "Could not find initial order status log for new order", { order_id: order.id });
  }
  summary.order.audit_log_id = log.id;
  record("order_initial_log", "pass", { log_id: log.id, event: log.event_type });
}

async function archiveOrder(order) {
  const resp = await fetchJson(
    `${BACKEND_URL}${withStoreId(`/api/store-admin/orders/${order.id}`)}`,
    {
      method: "DELETE",
      headers: auth(OWNER_TOKEN),
    }
  );
  if (!resp.ok || !resp.body) {
    fail("order_archive", "Store-admin archive order failed", { status: resp.status, body: resp.body });
  }
  const body = resp.body;
  if (!body.archived || !["cancelled", "voided"].includes(String(body.order_status || "").toLowerCase())) {
    fail("order_archive", "Archive response missing archived flag", { body });
  }
  record("order_archive", "pass", {
    status: resp.status,
    order_status: body.order_status,
    archived_reason: body.archived_reason,
  });
  return body;
}

async function verifyArchiveRetention(order) {
  const archiveResult = await archiveOrder(order);

  await new Promise((resolve) => setTimeout(resolve, 500));
  const auditResp = await ownerAuditRequest(100);
  const logs = findOrderLogs(auditResp.body, order.id);
  const archiveLog = logs.find((entry) => entry.event_type === `status:${archiveResult.order_status}`);
  if (!archiveLog) {
    fail("order_log_retention", "Missing archive status log", { order_id: order.id, target: archiveResult.order_status });
  }
  record("order_log_retention", "pass", { log_id: archiveLog.id, event: archiveLog.event_type });

  const adminResp = await fetchJson(
    `${BACKEND_URL}${withStoreId(`/api/store-admin/orders/${order.id}`)}`,
    {
      headers: auth(OWNER_TOKEN),
    }
  );
  if (!adminResp.ok || !adminResp.body) {
    fail("order_admin_lookup_archived", "Archived order lookup failed", { status: adminResp.status, body: adminResp.body });
  }
  const adminOrder = adminResp.body;
  if (!adminOrder.archived || adminOrder.status.toLowerCase() !== archiveResult.order_status.toLowerCase()) {
    fail("order_admin_lookup_archived", "Admin lookup missing archived metadata", { body: adminOrder });
  }
  record("order_admin_lookup_archived", "pass", { status: adminOrder.status });

  const staffList = await fetchJson(`${BACKEND_URL}${withStoreId("/api/store-admin/orders")}`, {
    headers: auth(STAFF_TOKEN),
  });
  if (!staffList.ok || !Array.isArray(staffList.body?.items)) {
    fail("order_staff_list_archived", "Staff order list failed", { status: staffList.status, body: staffList.body });
  }
  const staffOrder = staffList.body.items.find((item) => item.id === order.id);
  if (!staffOrder || !staffOrder.archived || !["cancelled", "voided"].includes(staffOrder.status.toLowerCase())) {
    fail("order_staff_list_archived", "Staff list missing archived flag", { order: staffOrder });
  }
  record("order_staff_list_archived", "pass", { status: staffOrder.status });

  const customerResp = await fetchJson(
    `${BACKEND_URL}/api/customer/orders/${order.id}?token=${encodeURIComponent(order.public_token)}`
  );
  if (!customerResp.ok) {
    fail("customer_status_archived", "Customer order lookup failed after archive", {
      status: customerResp.status,
      body: customerResp.body,
    });
  }
  const customerStatus = String(customerResp.body?.status || "").toLowerCase();
  if (!["cancelled", "voided"].includes(customerStatus)) {
    fail("customer_status_archived", "Customer status did not reflect archive", {
      status: customerStatus,
      body: customerResp.body,
    });
  }
  record("customer_status_archived", "pass", { status: customerStatus });
}

async function main() {
  try {
    assertLocalFirstUnlessCloud("Security audit smoke");
  } catch (error) {
    fail("local_first_policy", error.message, error.details || {});
  }

  try {
    ensureEnvVars(["backendUrl", "ownerToken", "staffToken", "storeId"]);
  } catch (error) {
    fail("missing_env", error.message, { missing: error.missing, summary: error.summary });
  }

  await ensureProductFixture();

  const health = await fetchJson(`${BACKEND_URL}/health`);
  if (!health.ok) {
    fail("backend_health", "Backend healthcheck failed", { status: health.status, body: health.body });
  }
  record("backend_health", "pass", { status: health.status });

  await verifyAuditEndpointAccess();
  await verifyChannelRoleGate();
  const order = await createCustomerOrder();
  verifyOrderNumberFormat(order);
  await verifyOrderTokenGuards(order);
  await verifyInitialAuditLog(order);
  await verifyArchiveRetention(order);

  finish(true, "Security audit smoke completed");
}

main().catch((error) => {
  fail("unexpected_error", error.message, { stack: error.stack });
});
