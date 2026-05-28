const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.e2e.local" });

const EXPECTED_BACKEND_URL = "http://127.0.0.1:8000";
const EXPECTED_FRONTEND_URL = "http://localhost:8080";

const summary = {
  phase: "Phase 5.5A Customer Public Flow Smoke",
  runtime: {
    backend_url: EXPECTED_BACKEND_URL,
    frontend_url: EXPECTED_FRONTEND_URL,
  },
  checks: {
    env: "not_run",
    backend_health: "not_run",
    frontend_reachable: "not_run",
    menu_list: "not_run",
    menu_detail: "not_run",
    create_order: "not_run",
    order_lookup: "not_run",
    customer_safe_fields: "not_run",
    no_admin_fields_exposed: "not_run",
  },
  ids: {
    product_id: null,
    order_id: null,
  },
  result: "fail",
  failure_code: null,
  next_action: null,
};

function outputAndExit(code, nextAction) {
  summary.failure_code = code;
  summary.next_action = nextAction;
  summary.result = code ? "fail" : "pass";
  console.log(JSON.stringify(summary, null, 2));
  process.exit(code ? 1 : 0);
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
  } catch (err) {
    return { ok: false, status: null, body: { error: err.message } };
  }
}

function assertNoAdminFields(obj) {
  const serialized = JSON.stringify(obj || {});
  const forbidden = [
    "supplier",
    "supplier_name",
    "service_role",
    "recipe",
    "total_cost",
    "gross_profit",
    "line_user_id\":\"U",
  ];
  return forbidden.every((x) => !serialized.includes(x));
}

async function main() {
  const backend = (process.env.E2E_BACKEND_URL || EXPECTED_BACKEND_URL).replace(/\/$/, "");
  const frontend = (process.env.E2E_FRONTEND_URL || EXPECTED_FRONTEND_URL).replace(/\/$/, "");
  if (backend !== EXPECTED_BACKEND_URL || frontend !== EXPECTED_FRONTEND_URL) {
    summary.checks.env = "fail";
    return outputAndExit("PRECHECK_INVALID_RUNTIME_URL", `Use backend=${EXPECTED_BACKEND_URL} and frontend=${EXPECTED_FRONTEND_URL}`);
  }
  summary.checks.env = "pass";

  const health = await fetchJson(`${backend}/health`);
  if (!health.ok) {
    summary.checks.backend_health = "fail";
    return outputAndExit("PRECHECK_BACKEND_DOWN", `Start backend at ${EXPECTED_BACKEND_URL}`);
  }
  summary.checks.backend_health = "pass";

  const front = await fetchJson(frontend);
  if (!front.ok) {
    summary.checks.frontend_reachable = "fail";
    return outputAndExit("PRECHECK_FRONTEND_DOWN", `Start frontend at ${EXPECTED_FRONTEND_URL}`);
  }
  summary.checks.frontend_reachable = "pass";

  const menuResp = await fetchJson(`${backend}/api/customer/menu`);
  if (!menuResp.ok || !Array.isArray(menuResp.body?.items) || menuResp.body.items.length === 0) {
    summary.checks.menu_list = "fail";
    return outputAndExit("MENU_LIST_FAILED", "Ensure /api/customer/menu returns at least one available item");
  }
  summary.checks.menu_list = "pass";

  const first = menuResp.body.items.find((x) => x.available) || menuResp.body.items[0];
  summary.ids.product_id = first.id;

  const detailResp = await fetchJson(`${backend}/api/customer/menu/${first.id}`);
  if (!detailResp.ok || !detailResp.body?.id) {
    summary.checks.menu_detail = "fail";
    return outputAndExit("MENU_DETAIL_FAILED", "Ensure /api/customer/menu/{product_id} works");
  }
  summary.checks.menu_detail = "pass";

  const createPayload = {
    customer: {
      name: "E2E Customer",
      phone: `099${Date.now().toString().slice(-7)}`,
      line_user_id: "U_mock_001",
    },
    items: [{ product_id: first.id, quantity: 1 }],
    pickup_time: new Date(Date.now() + 15 * 60000).toISOString(),
    note: "phase55a customer public smoke",
  };

  const createResp = await fetchJson(`${backend}/api/customer/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createPayload),
  });
  if (!createResp.ok || !createResp.body?.order_id) {
    summary.checks.create_order = "fail";
    return outputAndExit("ORDER_CREATE_FAILED", "Ensure /api/customer/orders accepts valid payload and creates order");
  }
  summary.checks.create_order = "pass";
  summary.ids.order_id = createResp.body.order_id;

  const lookupResp = await fetchJson(`${backend}/api/customer/orders/${createResp.body.order_id}`);
  if (!lookupResp.ok || !lookupResp.body?.order_id) {
    summary.checks.order_lookup = "fail";
    return outputAndExit("ORDER_LOOKUP_FAILED", "Ensure /api/customer/orders/{order_id} returns customer-safe summary");
  }
  summary.checks.order_lookup = "pass";

  const requiredFields = ["order_id", "status", "payment_status", "total_amount", "items"];
  const hasRequired = requiredFields.every((k) => Object.prototype.hasOwnProperty.call(lookupResp.body, k));
  summary.checks.customer_safe_fields = hasRequired ? "pass" : "fail";
  if (!hasRequired) {
    return outputAndExit("SAFE_FIELDS_MISSING", `Missing customer-safe fields in order response: ${requiredFields.join(", ")}`);
  }

  const noAdmin = assertNoAdminFields({
    menu_list: menuResp.body,
    menu_detail: detailResp.body,
    order_create: createResp.body,
    order_lookup: lookupResp.body,
  });
  summary.checks.no_admin_fields_exposed = noAdmin ? "pass" : "fail";
  if (!noAdmin) {
    return outputAndExit("ADMIN_FIELDS_EXPOSED", "Customer API exposed internal/admin-only fields");
  }

  return outputAndExit(null, "Customer public flow smoke passed.");
}

main().catch((err) => outputAndExit("UNHANDLED_EXCEPTION", err?.message || "Unhandled exception"));

