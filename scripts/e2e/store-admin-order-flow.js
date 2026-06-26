const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
require("dotenv").config({ path: ".env.e2e.local" });

// Load optional envs for service-role without overriding existing values
function loadOptionalEnv(p) {
  if (fs.existsSync(p)) {
    require("dotenv").config({ path: p, override: false });
  }
}

const ROOT = path.resolve(__dirname, "..", "..");
loadOptionalEnv(path.join(ROOT, ".env"));
loadOptionalEnv(path.join(ROOT, ".env.local"));
loadOptionalEnv(path.join(ROOT, "backend", ".env"));
loadOptionalEnv(path.join(ROOT, "backend", ".env.local"));

const EXPECTED_BACKEND_URL = "http://127.0.0.1:8000";
const EXPECTED_FRONTEND_URL = "http://localhost:8080";

const FAILURE = {
  ENV_MISSING: "PRECHECK_ENV_MISSING",
  INVALID_BACKEND_URL: "PRECHECK_INVALID_BACKEND_URL",
  BACKEND_DOWN: "PRECHECK_BACKEND_DOWN",
  DB_DOWN: "PRECHECK_DB_DOWN",
  AUTH_FAILED: "PRECHECK_AUTH_FAILED",
  PRODUCT_NOT_FOUND: "PRECHECK_PRODUCT_NOT_FOUND",
  CREATE_ORDER: "FLOW_CREATE_ORDER_FAILED",
  CREATE_PAYMENT: "FLOW_CREATE_PAYMENT_FAILED",
  SUBMIT_SLIP: "FLOW_SUBMIT_SLIP_FAILED",
  APPROVE_PAYMENT: "FLOW_APPROVE_PAYMENT_FAILED",
  STATUS_TRANSITION: "FLOW_STATUS_TRANSITION_FAILED",
  VERIFY_ORDERS: "VERIFY_ORDERS_API_FAILED",
  VERIFY_PAYMENTS: "VERIFY_PAYMENTS_API_FAILED",
  VERIFY_PAYMENT_LOGS: "VERIFY_PAYMENT_LOGS_FAILED",
  VERIFY_ORDER_LOGS: "VERIFY_ORDER_LOGS_FAILED",
  VERIFY_LINE_LOGS: "VERIFY_LINE_NOTIFICATION_LOGS_FAILED",
};

const summary = {
  phase: "Phase 4 Regression",
  runtime: {
    backend_url: EXPECTED_BACKEND_URL,
    frontend_url: EXPECTED_FRONTEND_URL,
  },
  preflight: {
    env: "not_run",
    backend: "not_run",
    db: "not_run",
    auth: "not_run",
    product: "not_run",
  },
  flow: {
    create_order: "not_run",
    create_payment: "not_run",
    submit_slip: "not_run",
    approve_payment: "not_run",
    preparing: "not_run",
    ready: "not_run",
    completed: "not_run",
  },
  verification: {
    orders_api: "not_run",
    payments_api: "not_run",
    payment_status_logs: "not_run",
    order_status_logs: "not_run",
    line_notification_logs: "not_run",
  },
  notification_responses: {
    approve_payment_mock_notification: null,
    ready_mock_notification: null,
  },
  verification_details: {
    line_notification_logs_count: 0,
    line_notification_message_types: [],
    has_payment_approved_log: false,
    has_order_ready_log: false,
    line_notification_query_method: "not_run",
  },
  result: "fail",
  failure_code: null,
  next_action: null,
};

function setPreflight(step, status) {
  summary.preflight[step] = status;
}

function getServiceRoleClient(fallbackUrl) {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.E2E_SUPABASE_URL || fallbackUrl || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    return { ok: false, missing };
  }
  const requireFrontend = createRequire(path.resolve(__dirname, "../../frontend/package.json"));
  const { createClient } = requireFrontend("@supabase/supabase-js");
  return { ok: true, client: createClient(supabaseUrl, serviceRoleKey) };
}
function setFlow(step, status) {
  summary.flow[step] = status;
}
function setVerify(step, status) {
  summary.verification[step] = status;
}

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
    return { status: res.status, ok: res.ok, body };
  } catch (err) {
    return { status: null, ok: false, body: { error: err.message } };
  }
}

function loadConfig() {
  const required = [
    "E2E_BACKEND_URL",
    "E2E_SUPABASE_URL",
    "E2E_SUPABASE_ANON_KEY",
    "E2E_EMAIL",
    "E2E_PASSWORD",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    setPreflight("env", "fail");
    outputAndExit(
      FAILURE.ENV_MISSING,
      `Missing required env: ${missing.join(", ")}. Ensure .env.e2e.local is populated.`
    );
  }

  const backendUrl = process.env.E2E_BACKEND_URL.replace(/\/$/, "");
  if (backendUrl !== EXPECTED_BACKEND_URL) {
    setPreflight("env", "fail");
    outputAndExit(
      FAILURE.INVALID_BACKEND_URL,
      `E2E_BACKEND_URL must be ${EXPECTED_BACKEND_URL} for Phase 4. Update .env.e2e.local.`
    );
  }

  setPreflight("env", "pass");
  return {
    backendBase: backendUrl,
    supabaseUrl: process.env.E2E_SUPABASE_URL.replace(/\/$/, ""),
    anonKey: process.env.E2E_SUPABASE_ANON_KEY,
    email: process.env.E2E_EMAIL,
    password: process.env.E2E_PASSWORD,
    productId: process.env.E2E_PRODUCT_ID || "",
    productName: process.env.E2E_PRODUCT_NAME || "E2E product",
    unitPrice: Number(process.env.E2E_UNIT_PRICE || 60),
    unitCost: Number(process.env.E2E_UNIT_COST || 27),
    defaultsUsed: {
      unitPrice: !process.env.E2E_UNIT_PRICE,
      unitCost: !process.env.E2E_UNIT_COST,
    },
  };
}

async function preflightBackend(cfg) {
  const health = await fetchJson(`${cfg.backendBase}/health`);
  if (!health.ok) {
    setPreflight("backend", "fail");
    outputAndExit(
      FAILURE.BACKEND_DOWN,
      `Backend not reachable at ${EXPECTED_BACKEND_URL}. Start with: cd backend && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
    );
  }
  setPreflight("backend", "pass");
}

async function preflightDb(cfg) {
  const db = await fetchJson(`${cfg.backendBase}/health/db`);
  if (!db.ok) {
    setPreflight("db", "fail");
    outputAndExit(FAILURE.DB_DOWN, "Database health check failed via /health/db.");
  }
  setPreflight("db", "pass");
}

async function preflightAuth(cfg) {
  const auth = await fetchJson(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: cfg.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  if (!auth.ok || !auth.body?.access_token) {
    setPreflight("auth", "fail");
    outputAndExit(FAILURE.AUTH_FAILED, "Supabase auth failed. Check E2E_EMAIL/E2E_PASSWORD.");
  }
  setPreflight("auth", "pass");
  return auth.body.access_token;
}

async function preflightProduct(cfg, token) {
  const resp = await fetchJson(`${cfg.backendBase}/api/store-admin/menus`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const items = Array.isArray(resp.body?.items) ? resp.body.items : [];
  const simplified = items.map((p) => ({
    id: p.id,
    name: p.name,
    base_price: p.base_price ?? p.price ?? null,
    is_active: p.is_active ?? p.available ?? true,
  }));
  summary.product_candidates = simplified;

  if (!resp.ok) {
    setPreflight("product", "fail");
    outputAndExit(
      FAILURE.PRODUCT_NOT_FOUND,
      `Backend product endpoint failed (${resp.status}); verify /api/store-admin/menus.`
    );
  }

  let selected = null;
  if (cfg.productId) {
    selected = simplified.find((p) => p.id === cfg.productId);
  }
  if (!selected) {
    selected = simplified.find((p) => p.is_active) || simplified[0];
  }
  if (!selected) {
    setPreflight("product", "fail");
    const candidates = simplified.map((p) => `${p.name} (${p.id})`).join(", ");
    outputAndExit(
      FAILURE.PRODUCT_NOT_FOUND,
      `No active products available via backend menus. Candidates: ${candidates || "<none>"}`
    );
  }

  cfg.productId = selected.id;
  summary.selected_product = selected;
  if (cfg.defaultsUsed.unitPrice) {
    const candidatePrice = Number(selected.base_price ?? cfg.unitPrice);
    cfg.unitPrice = Number.isFinite(candidatePrice) && candidatePrice > 0 ? candidatePrice : cfg.unitPrice;
  }
  if (cfg.defaultsUsed.unitCost) {
    const inferredCost = Number((cfg.unitPrice || 0) * 0.45);
    if (Number.isFinite(inferredCost) && inferredCost > 0) {
      cfg.unitCost = Number(inferredCost.toFixed(2));
    }
  }
  setPreflight("product", "pass");
}

async function main() {
  const cfg = loadConfig();

  await preflightBackend(cfg);
  await preflightDb(cfg);
  const token = await preflightAuth(cfg);
  await preflightProduct(cfg, token);

  const authHeaders = { Authorization: `Bearer ${token}` };
  const authed = async (step, method, path, body) => {
    const init = { method, headers: { ...authHeaders } };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const resp = await fetchJson(`${cfg.backendBase}${path}`, init);
    return resp;
  };

  // Flow: create order
  const orderPayload = {
    status: "pending_payment",
    payment_status: "unpaid",
    subtotal: cfg.unitPrice,
    total_amount: cfg.unitPrice,
    total_cost: cfg.unitCost,
    gross_profit: cfg.unitPrice - cfg.unitCost,
    items: [
      {
        product_id: cfg.productId,
        quantity: 1,
        unit_price: cfg.unitPrice,
        unit_cost: cfg.unitCost,
      },
    ],
    note: `e2e order for ${cfg.productName}`,
  };

  const orderResp = await authed("create_order", "POST", "/api/store-admin/orders", orderPayload);
  setFlow("create_order", orderResp.ok ? "pass" : "fail");
  if (!orderResp.ok || !orderResp.body?.id) {
    outputAndExit(FAILURE.CREATE_ORDER, "Create order failed; see response body.");
  }
  const orderId = orderResp.body.id;
  summary.order_id = orderId;

  // Flow: create payment
  const paymentResp = await authed(
    "create_payment",
    "POST",
    `/api/store-admin/orders/${orderId}/payments`,
    { amount: cfg.unitPrice, method: "promptpay", slip_url: "mock://slip" }
  );
  setFlow("create_payment", paymentResp.ok ? "pass" : "fail");
  if (!paymentResp.ok || !paymentResp.body?.id) {
    outputAndExit(FAILURE.CREATE_PAYMENT, "Create payment failed; see response body.");
  }
  const paymentId = paymentResp.body.id;
  summary.payment_id = paymentId;

  // Flow: submit slip
  const submitResp = await authed(
    "submit_slip",
    "POST",
    `/api/store-admin/payments/${paymentId}/submit-slip`,
    { slip_url: "mock://submitted", slip_storage_path: null, slip_file_name: "e2e-slip" }
  );
  setFlow("submit_slip", submitResp.ok ? "pass" : "fail");
  if (!submitResp.ok) {
    outputAndExit(FAILURE.SUBMIT_SLIP, "Submit slip failed; see response body.");
  }

  // Flow: approve payment
  const approveResp = await authed(
    "approve_payment",
    "POST",
    `/api/store-admin/payments/${paymentId}/approve`,
    { note: "e2e approve" }
  );
  setFlow("approve_payment", approveResp.ok ? "pass" : "fail");
  if (!approveResp.ok) {
    outputAndExit(FAILURE.APPROVE_PAYMENT, "Approve payment failed; see response body.");
  }
  summary.notification_responses.approve_payment_mock_notification = approveResp.body?.mock_notification || null;

  // Flow: order status transitions
  const transitions = ["preparing", "ready", "completed"];
  for (const status of transitions) {
    const resp = await authed(
      `status_${status}`,
      "PATCH",
      `/api/store-admin/orders/${orderId}/status`,
      { status }
    );
    setFlow(status, resp.ok ? "pass" : "fail");
    if (!resp.ok) {
      outputAndExit(FAILURE.STATUS_TRANSITION, `Status transition ${status} failed.`);
    }
    if (status === "ready") {
      summary.notification_responses.ready_mock_notification = resp.body?.mock_notification || null;
    }
  }

  // Verification: orders & payments APIs
  const orderGet = await authed("get_order", "GET", `/api/store-admin/orders/${orderId}`);
  setVerify("orders_api", orderGet.ok ? "pass" : "fail");
  if (!orderGet.ok) {
    outputAndExit(FAILURE.VERIFY_ORDERS, "Orders API verification failed.");
  }

  const orderPayments = await authed(
    "get_order_payments",
    "GET",
    `/api/store-admin/orders/${orderId}/payments`
  );
  setVerify("payments_api", orderPayments.ok ? "pass" : "fail");
  if (!orderPayments.ok) {
    outputAndExit(FAILURE.VERIFY_PAYMENTS, "Payments API verification failed.");
  }

  const orderStatus = orderGet.body?.status || null;
  const orderPaymentStatus = orderGet.body?.payment_status || null;
  const paymentStatus = (() => {
    const items = Array.isArray(orderPayments.body?.items)
      ? orderPayments.body.items
      : Array.isArray(orderPayments.body)
        ? orderPayments.body
        : [];
    const target = items.find((p) => p.id === paymentId);
    return target ? target.status : null;
  })();

  // Verification: logs via Supabase REST
  const supabaseHeaders = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.anonKey}`,
  };

  const paymentLogs = await fetchJson(
    `${cfg.supabaseUrl}/rest/v1/payment_status_logs?order_id=eq.${orderId}&payment_id=eq.${paymentId}&order=created_at.asc`,
    { headers: supabaseHeaders }
  );
  setVerify("payment_status_logs", paymentLogs.ok ? "pass" : "fail");
  if (!paymentLogs.ok) {
    outputAndExit(FAILURE.VERIFY_PAYMENT_LOGS, "Payment status logs check failed.");
  }

  const orderLogs = await fetchJson(
    `${cfg.supabaseUrl}/rest/v1/order_status_logs?order_id=eq.${orderId}&order=created_at.asc`,
    { headers: supabaseHeaders }
  );
  setVerify("order_status_logs", orderLogs.ok ? "pass" : "fail");
  if (!orderLogs.ok) {
    outputAndExit(FAILURE.VERIFY_ORDER_LOGS, "Order status logs check failed.");
  }

  // Verification: line notification logs (service-role to bypass RLS)
  const sr = getServiceRoleClient(cfg.supabaseUrl);
  summary.verification_details.line_notification_query_method = sr.ok ? "service_role" : "missing_service_role";
  if (!sr.ok) {
    setVerify("line_notification_logs", "fail");
    outputAndExit(
      FAILURE.VERIFY_LINE_LOGS,
      "SERVICE_ROLE_ENV_MISSING_FOR_PROTECTED_LOG_VERIFICATION"
    );
  }

  const { data: lineData, error: lineError } = await sr.client
    .from("line_notification_logs")
    .select("order_id,message_type,send_status,line_user_id,created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (lineError) {
    setVerify("line_notification_logs", "fail");
    outputAndExit(FAILURE.VERIFY_LINE_LOGS, "Line notification logs check failed (service-role).");
  }

  const lineRows = Array.isArray(lineData) ? lineData : [];
  const lineNotificationLogsCount = lineRows.length;
  const lineTypes = [...new Set(lineRows.map((l) => l.message_type))];
  const sendStatusValues = [...new Set(lineRows.map((l) => l.send_status))];
  const hasPaymentApprovedLog = lineTypes.includes("payment_approved");
  const hasOrderReadyLog = lineTypes.includes("order_ready");
  const hasSuccessStatus = sendStatusValues.includes("success");

  summary.verification_details.line_notification_logs_count = lineNotificationLogsCount;
  summary.verification_details.line_notification_message_types = lineTypes;
  summary.verification_details.has_payment_approved_log = hasPaymentApprovedLog;
  summary.verification_details.has_order_ready_log = hasOrderReadyLog;
  summary.line_notification_logs_count = lineNotificationLogsCount;
  summary.line_notification_message_types = lineTypes;

  if (
    lineNotificationLogsCount < 2 ||
    !hasPaymentApprovedLog ||
    !hasOrderReadyLog ||
    !hasSuccessStatus
  ) {
    setVerify("line_notification_logs", "fail");
    const missing = [
      lineNotificationLogsCount < 2 ? "count<2" : null,
      !hasPaymentApprovedLog ? "payment_approved" : null,
      !hasOrderReadyLog ? "order_ready" : null,
      !hasSuccessStatus ? "send_status_success" : null,
    ]
      .filter(Boolean)
      .join(", ");
    outputAndExit(
      FAILURE.VERIFY_LINE_LOGS,
      `Missing required notification logs: ${missing || "unknown"}`
    );
  }

  setVerify("line_notification_logs", "pass");

  summary.result = "pass";
  summary.failure_code = null;
  summary.next_action = "None";
  summary.order_id = orderId;
  summary.payment_id = paymentId;
  summary.order_status = orderStatus;
  summary.order_payment_status = orderPaymentStatus;
  summary.payment_status = paymentStatus;
  summary.line_notification_message_types = lineTypes;
  summary.expectations = {
    payment_status_paid: paymentStatus === "paid",
    order_payment_status_paid: orderPaymentStatus === "paid",
    order_status_completed: orderStatus === "completed",
    has_payment_approved_log: hasPaymentApprovedLog,
    has_order_ready_log: hasOrderReadyLog,
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch((err) => {
  summary.result = "fail";
  summary.failure_code = "script_error";
  summary.next_action = err.message;
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
});
