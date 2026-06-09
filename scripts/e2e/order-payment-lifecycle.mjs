#!/usr/bin/env node
import "dotenv/config";
import process from "node:process";
import { randomUUID } from "node:crypto";

const BACKEND_URL = (process.env.BACKEND_URL || process.env.E2E_BACKEND_URL || "").replace(/\/+$/, "");
const ADMIN_TOKEN = process.env.OWNER_TOKEN || process.env.STAFF_TOKEN || process.env.ADMIN_TOKEN || process.env.E2E_ADMIN_TOKEN || "";
const STORE_ID = process.env.TEST_STORE_ID || process.env.E2E_STORE_ID || "";
const PRODUCT_ID = process.env.CUSTOMER_PRODUCT_ID || process.env.E2E_PRODUCT_ID || "";

const summary = {
  result: "pending",
  steps: [],
  orders: {},
  metrics: {},
};

function record(step, detail) {
  summary.steps.push({ step, ...detail });
}

function finish(ok, message) {
  summary.result = ok ? "pass" : "fail";
  if (message) {
    summary.message = message;
  }
  console.log(JSON.stringify(summary, null, 2));
  process.exit(ok ? 0 : 1);
}

function fail(step, message, detail) {
  record(step, { ok: false, message, detail });
  finish(false, message);
}

function assertCondition(condition, step, message, detail) {
  if (!condition) {
    fail(step, message, detail);
  }
}

if (!BACKEND_URL) {
  fail("env_check", "missing_backend_url", "Set BACKEND_URL (or E2E_BACKEND_URL) to the FastAPI host, e.g. http://127.0.0.1:8000");
}

if (!ADMIN_TOKEN) {
  fail("env_check", "missing_admin_token", "Set OWNER_TOKEN, STAFF_TOKEN, ADMIN_TOKEN, or E2E_ADMIN_TOKEN to a valid bearer token");
}

if (!PRODUCT_ID) {
  fail("env_check", "missing_product_id", "Set CUSTOMER_PRODUCT_ID (or E2E_PRODUCT_ID) to a valid product UUID");
}

const REPORT_DATE = new Date().toISOString().slice(0, 10);
const EPSILON = 0.01;

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

function withStoreId(path) {
  if (!STORE_ID) {
    return path;
  }
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}store_id=${encodeURIComponent(STORE_ID)}`;
}

async function adminRequest(method, path, body, options = {}) {
  const headers = { Authorization: `Bearer ${ADMIN_TOKEN}`, ...(options.headers || {}) };
  let requestBody = body;
  if (requestBody !== undefined && !(requestBody instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    requestBody = headers["Content-Type"] === "application/json" ? JSON.stringify(body) : body;
  }
  return fetchJson(`${BACKEND_URL}${path}`, { method, headers, body: requestBody });
}

async function customerRequest(method, path, body, options = {}) {
  const headers = { ...(options.headers || {}) };
  let requestBody = body;
  if (requestBody !== undefined && !(requestBody instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    requestBody = headers["Content-Type"] === "application/json" ? JSON.stringify(body) : body;
  }
  return fetchJson(`${BACKEND_URL}${path}`, { method, headers, body: requestBody });
}

function randomPhone() {
  const suffix = `${Math.floor(1000000 + Math.random() * 9000000)}`;
  return `099${suffix}`;
}

async function createCustomerOrder(label) {
  const pickupTime = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const payload = {
    customer: {
      name: `E2E Customer ${label}`,
      phone: randomPhone(),
    },
    items: [
      {
        product_id: PRODUCT_ID,
        quantity: 1,
      },
    ],
    pickup_time: pickupTime,
    note: `Automated order (${label})`,
    store_id: STORE_ID || undefined,
  };

  const resp = await customerRequest("POST", "/api/customer/orders", payload);
  if (!resp.ok) {
    fail(`${label}_create_order`, "customer_order_create_failed", resp.body);
  }

  const orderId = resp.body.order_id || resp.body.orderId;
  const publicToken = resp.body.public_token || resp.body.publicToken;
  const totalAmount = Number(resp.body.total_amount || resp.body.totalAmount || 0);
  assertCondition(orderId && publicToken, `${label}_create_order`, "missing_order_identifiers", resp.body);

  const recordDetail = { order_id: orderId, public_token: publicToken, total_amount: totalAmount };
  summary.orders[label] = recordDetail;
  record(`${label}_create_order`, { ok: true, ...recordDetail });
  return { id: orderId, publicToken, amount: totalAmount };
}

async function getCustomerStatus(publicToken, label) {
  const resp = await customerRequest("GET", `/api/customer/orders/status?token=${encodeURIComponent(publicToken)}`);
  if (!resp.ok) {
    fail(`${label}_customer_status`, "customer_status_lookup_failed", resp.body);
  }
  const forbidden = ["store_id", "storeId", "customer_id", "customerId", "gross_profit", "total_cost", "cancelled_reason", "cancelled_at", "note"];
  forbidden.forEach((field) => {
    assertCondition(!(field in resp.body), "customer_payload_guard", `customer payload leaked ${field}`, resp.body);
  });
  record(`${label}_customer_status`, {
    ok: true,
    order_status: resp.body.order_status,
    payment_status: resp.body.payment_status,
    total_amount: resp.body.total_amount,
  });
  return resp.body;
}

async function uploadCustomerSlip(publicToken, label, expectedStatus = 200) {
  const form = new FormData();
  form.set("public_token", publicToken);
  form.set("file", new Blob([`fake-image-${label}`], { type: "image/jpeg" }), `${label}.jpg`);
  const resp = await customerRequest("POST", "/api/customer/orders/status/slip", form);
  if (resp.status !== expectedStatus) {
    fail(label, "unexpected_slip_upload_status", { expected: expectedStatus, actual: resp.status, body: resp.body });
  }
  record(label, { ok: true, status: resp.status });
  return resp;
}

async function getPaymentId(orderId, label) {
  const path = withStoreId(`/api/store-admin/orders/${orderId}/payments`);
  const resp = await adminRequest("GET", path);
  if (!resp.ok) {
    fail(`${label}_payment_lookup`, "order_payments_lookup_failed", resp.body);
  }
  const items = Array.isArray(resp.body?.items) ? resp.body.items : Array.isArray(resp.body) ? resp.body : [];
  assertCondition(items.length > 0, `${label}_payment_lookup`, "no_payments_found", resp.body);
  const paymentId = items[0].id;
  record(`${label}_payment_lookup`, { ok: true, payment_id: paymentId, status: items[0].status });
  return paymentId;
}

async function rejectPayment(paymentId, reasonLabel) {
  const payload = { reason: `Automated reject (${reasonLabel})`, note: `Slip rejected for ${reasonLabel}` };
  const resp = await adminRequest("POST", withStoreId(`/api/store-admin/payments/${paymentId}/reject`), payload);
  if (!resp.ok) {
    fail(`${reasonLabel}_reject_payment`, "payment_reject_failed", resp.body);
  }
  record(`${reasonLabel}_reject_payment`, { ok: true, payment_id: paymentId });
}

async function approvePayment(paymentId, label) {
  const payload = { note: `Automated approve (${label})` };
  const resp = await adminRequest("POST", withStoreId(`/api/store-admin/payments/${paymentId}/approve`), payload);
  if (!resp.ok) {
    fail(`${label}_approve_payment`, "payment_approve_failed", resp.body);
  }
  record(`${label}_approve_payment`, { ok: true, payment_id: paymentId });
}

async function patchOrderStatus(orderId, status, label) {
  const resp = await adminRequest("PATCH", withStoreId(`/api/store-admin/orders/${orderId}/status`), { status });
  if (!resp.ok) {
    fail(`${label}_status_${status}`, "order_status_update_failed", resp.body);
  }
  record(`${label}_status_${status}`, { ok: true, status });
}

async function cancelOrder(orderId, label) {
  const resp = await adminRequest("POST", withStoreId(`/api/store-admin/orders/${orderId}/cancel`), { reason: `Automated cancel (${label})` });
  if (!resp.ok) {
    fail(`${label}_cancel_order`, "order_cancel_failed", resp.body);
  }
  record(`${label}_cancel_order`, { ok: true, status: resp.body.status });
}

async function fetchAdminOrder(orderId, label) {
  const resp = await adminRequest("GET", withStoreId(`/api/store-admin/orders/${orderId}`));
  if (!resp.ok) {
    fail(`${label}_fetch_order`, "store_admin_order_lookup_failed", resp.body);
  }
  record(`${label}_fetch_order`, { ok: true, status: resp.body.status, payment_status: resp.body.payment_status });
  return resp.body;
}

async function getDashboardSummary(tag) {
  const resp = await adminRequest("GET", withStoreId("/api/store-admin/dashboard-summary"));
  if (!resp.ok) {
    fail(`${tag}_dashboard`, "dashboard_summary_failed", resp.body);
  }
  summary.metrics[`${tag}_dashboard`] = resp.body;
  record(`${tag}_dashboard`, { ok: true, confirmed_revenue_today: resp.body.confirmed_revenue_today });
  return resp.body;
}

async function getSalesReport(tag) {
  const query = `/api/store-admin/reports/sales?start_date=${REPORT_DATE}&end_date=${REPORT_DATE}`;
  const resp = await adminRequest("GET", withStoreId(query));
  if (!resp.ok) {
    fail(`${tag}_sales_report`, "sales_report_failed", resp.body);
  }
  summary.metrics[`${tag}_sales_report`] = resp.body.summary;
  record(`${tag}_sales_report`, { ok: true, total_sales_confirmed: resp.body.summary?.total_sales_confirmed });
  return resp.body;
}

function diff(valueA, valueB) {
  return Number((valueA - valueB).toFixed(4));
}

function assertApprox(actual, expected, step, context) {
  if (Math.abs(actual - expected) > EPSILON) {
    fail(step, "metric_delta_mismatch", { expected, actual, ...context });
  }
}

async function main() {
  const dashboardBaseline = await getDashboardSummary("baseline");
  const reportBaseline = await getSalesReport("baseline");

  const primaryOrder = await createCustomerOrder("primary");
  await getCustomerStatus(primaryOrder.publicToken, "primary");

  const primaryPaymentId = await getPaymentId(primaryOrder.id, "primary");

  await uploadCustomerSlip(primaryOrder.publicToken, "primary_first_slip");
  await uploadCustomerSlip(primaryOrder.publicToken, "primary_duplicate_slip_blocked", 409);

  await rejectPayment(primaryPaymentId, "primary");
  await uploadCustomerSlip(primaryOrder.publicToken, "primary_reupload_after_reject");

  await approvePayment(primaryPaymentId, "primary");
  await uploadCustomerSlip(primaryOrder.publicToken, "primary_paid_blocked", 409);

  const statuses = ["accepted", "preparing", "ready", "completed"];
  for (const status of statuses) {
    await patchOrderStatus(primaryOrder.id, status, "primary");
  }

  const dashboardAfterPrimary = await getDashboardSummary("after_primary");
  const reportAfterPrimary = await getSalesReport("after_primary");

  const dashboardDeltaPrimary = diff(dashboardAfterPrimary.confirmed_revenue_today, Number(dashboardBaseline.confirmed_revenue_today || 0));
  const reportDeltaPrimary = diff(reportAfterPrimary.summary?.total_sales_confirmed || 0, reportBaseline.summary?.total_sales_confirmed || 0);

  assertApprox(dashboardDeltaPrimary, primaryOrder.amount, "primary_dashboard_delta", { dashboardDeltaPrimary, order_amount: primaryOrder.amount });
  assertApprox(reportDeltaPrimary, primaryOrder.amount, "primary_report_delta", { reportDeltaPrimary, order_amount: primaryOrder.amount });
  record("primary_revenue_verified", { ok: true, dashboard_delta: dashboardDeltaPrimary, report_delta: reportDeltaPrimary });

  const cancelledOrder = await createCustomerOrder("cancelled");
  const cancelledPaymentId = await getPaymentId(cancelledOrder.id, "cancelled");
  await approvePayment(cancelledPaymentId, "cancelled");
  await cancelOrder(cancelledOrder.id, "cancelled");

  const cancelledSnapshot = await fetchAdminOrder(cancelledOrder.id, "cancelled_snapshot");
  assertCondition(
    cancelledSnapshot.status === "cancelled" && cancelledSnapshot.payment_status === "paid",
    "cancelled_snapshot",
    "cancelled_order_not_paid",
    cancelledSnapshot,
  );

  const dashboardAfterCancelled = await getDashboardSummary("after_cancelled");
  const reportAfterCancelled = await getSalesReport("after_cancelled");

  const dashboardDeltaCancelled = diff(dashboardAfterCancelled.confirmed_revenue_today, dashboardAfterPrimary.confirmed_revenue_today);
  const reportDeltaCancelled = diff(reportAfterCancelled.summary?.total_sales_confirmed || 0, reportAfterPrimary.summary?.total_sales_confirmed || 0);

  assertApprox(dashboardDeltaCancelled, 0, "cancelled_dashboard_delta", { dashboard_after_cancelled: dashboardAfterCancelled.confirmed_revenue_today });
  assertApprox(reportDeltaCancelled, 0, "cancelled_report_delta", { report_after_cancelled: reportAfterCancelled.summary?.total_sales_confirmed });
  record("cancelled_revenue_excluded", {
    ok: true,
    dashboard_delta: dashboardDeltaCancelled,
    report_delta: reportDeltaCancelled,
  });

  finish(true);
}

main().catch((error) => {
  fail("script_error", error.message, { stack: error.stack });
});
