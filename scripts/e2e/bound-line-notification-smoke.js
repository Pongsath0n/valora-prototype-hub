/*
 * Phase 5.3C - Bound customer LINE notification smoke (mock-only)
 * - No LINE Messaging API calls
 * - No real LINE send/reply
 * - Verifies line_notification_logs uses bound customers.line_user_id when available
 */

const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const fetch = global.fetch || require("node-fetch");
require("dotenv").config({ path: ".env.e2e.local" });

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
const FALLBACK_LINE_USER = "mock-line-user";

function maskLineUserId(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length <= 4) return "***";
  if (s.length <= 8) return `${s.slice(0, 2)}...${s.slice(-2)}`;
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function outputAndExit(summary, code = 0) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(code);
}

class FlowAbort extends Error {
  constructor(code) {
    super("flow_abort");
    this.code = code;
  }
}

function abortFlow(summary, failureCode, nextAction, code = 1) {
  summary.result = "fail";
  summary.failure_code = failureCode;
  summary.next_action = nextAction;
  throw new FlowAbort(code);
}

function requireEnv(summary, key) {
  const value = process.env[key];
  if (!value) {
    summary.result = "fail";
    summary.failure_code = "PRECHECK_ENV_MISSING";
    summary.next_action = `Missing required env: ${key}`;
    outputAndExit(summary, 1);
  }
  return value;
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
    return { ok: false, status: null, body: { error: String(err.message || err) } };
  }
}

async function main() {
  const summary = {
    phase: "Phase 5.3C Bound LINE Notification Smoke",
    runtime: {
      backend_url: EXPECTED_BACKEND_URL,
      frontend_url: EXPECTED_FRONTEND_URL,
    },
    preflight: {
      env: "not_run",
      backend: "not_run",
      db: "not_run",
      auth: "not_run",
      customer: "not_run",
      product: "not_run",
    },
    actions: {
      bind: "not_run",
      create_order: "not_run",
      create_payment: "not_run",
      submit_slip: "not_run",
      approve_payment: "not_run",
      move_ready: "not_run",
      cleanup_unbind: "not_run",
    },
    verification: {
      line_logs: "not_run",
      customer_masking: "not_run",
      fallback_not_used_for_bound: "not_run",
    },
    ids: {
      customer_id: null,
      order_id: null,
      payment_id: null,
      bound_line_user_id_masked: null,
    },
    result: "fail",
    failure_code: null,
    next_action: null,
  };

  const backendBase = requireEnv(summary, "E2E_BACKEND_URL").replace(/\/$/, "");
  const supabaseUrl = requireEnv(summary, "E2E_SUPABASE_URL").replace(/\/$/, "");
  const anonKey = requireEnv(summary, "E2E_SUPABASE_ANON_KEY");
  const email = requireEnv(summary, "E2E_EMAIL");
  const password = requireEnv(summary, "E2E_PASSWORD");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (backendBase !== EXPECTED_BACKEND_URL) {
    summary.preflight.env = "fail";
    abortFlow(summary, "PRECHECK_INVALID_BACKEND_URL", `E2E_BACKEND_URL must be ${EXPECTED_BACKEND_URL}`);
  }
  if (!serviceRoleKey) {
    summary.preflight.env = "fail";
    abortFlow(summary, "PRECHECK_ENV_MISSING", "Missing required env: SUPABASE_SERVICE_ROLE_KEY");
  }
  summary.preflight.env = "pass";

  const health = await fetchJson(`${backendBase}/health`);
  if (!health.ok) {
    summary.preflight.backend = "fail";
    abortFlow(summary, "PRECHECK_BACKEND_DOWN", `Backend not reachable at ${EXPECTED_BACKEND_URL}`);
  }
  summary.preflight.backend = "pass";

  const healthDb = await fetchJson(`${backendBase}/health/db`);
  if (!healthDb.ok) {
    summary.preflight.db = "fail";
    abortFlow(summary, "PRECHECK_DB_DOWN", "Database health check failed via /health/db");
  }
  summary.preflight.db = "pass";

  const auth = await fetchJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!auth.ok || !auth.body?.access_token) {
    summary.preflight.auth = "fail";
    abortFlow(summary, "PRECHECK_AUTH_FAILED", "Supabase auth failed. Check E2E_EMAIL/E2E_PASSWORD.");
  }
  summary.preflight.auth = "pass";
  const token = auth.body.access_token;

  const authed = async (method, pathValue, body) => {
    const init = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return fetchJson(`${backendBase}${pathValue}`, init);
  };

  const customersResp = await authed("GET", "/api/store-admin/customers");
  if (!customersResp.ok || !Array.isArray(customersResp.body?.items)) {
    summary.preflight.customer = "fail";
    abortFlow(summary, "PRECHECK_CUSTOMER_QUERY_FAILED", "Cannot load customers from /api/store-admin/customers");
  }
  const unlinked = customersResp.body.items.find((c) => c.line_binding_status === "unlinked");
  if (!unlinked?.id) {
    summary.preflight.customer = "fail";
    abortFlow(summary, "PRECHECK_UNLINKED_CUSTOMER_NOT_FOUND", "Need at least one unlinked customer for safe bind smoke");
  }
  summary.preflight.customer = "pass";
  summary.ids.customer_id = unlinked.id;

  const productResp = await authed("GET", "/api/store-admin/menus");
  const productItems = Array.isArray(productResp.body?.items) ? productResp.body.items : [];
  const envProductId = process.env.E2E_PRODUCT_ID || "";
  let selectedProduct = null;
  if (envProductId) {
    selectedProduct = productItems.find((p) => p.id === envProductId);
  }
  if (!selectedProduct) {
    selectedProduct = productItems.find((p) => (p.is_active ?? p.available ?? true)) || productItems[0];
  }
  if (!productResp.ok || !selectedProduct) {
    summary.preflight.product = "fail";
    const candidates = productItems.map((p) => `${p.name} (${p.id})`).join(", ");
    abortFlow(summary, "PRECHECK_PRODUCT_NOT_FOUND", `No active products available via /api/store-admin/menus. Candidates: ${candidates || "<none>"}`);
  }
  summary.preflight.product = "pass";
  summary.ids.product_id = selectedProduct.id;

  const requireFrontend = createRequire(path.resolve(__dirname, "../../frontend/package.json"));
  const { createClient } = requireFrontend("@supabase/supabase-js");
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const uniqueLineId = `Uphase53c_test_${Date.now()}`;
  const lineMask = maskLineUserId(uniqueLineId);
  summary.ids.bound_line_user_id_masked = lineMask;

  let cleanupNeeded = false;
  try {
    const bindResp = await authed("POST", `/api/store-admin/customers/${unlinked.id}/bind-line`, {
      line_user_id: uniqueLineId,
    });
    summary.actions.bind = bindResp.ok ? "pass" : "fail";
    if (!bindResp.ok) {
      abortFlow(summary, "FLOW_BIND_FAILED", "Bind customer line_user_id failed");
    }
    cleanupNeeded = true;

    const envUnitPrice = process.env.E2E_UNIT_PRICE;
    let unitPrice = Number(envUnitPrice);
    if (!envUnitPrice || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      unitPrice = Number(selectedProduct.base_price ?? selectedProduct.price ?? 60) || 60;
    }
    const envUnitCost = process.env.E2E_UNIT_COST;
    let unitCost = Number(envUnitCost);
    if (!envUnitCost || !Number.isFinite(unitCost) || unitCost <= 0) {
      unitCost = Number((unitPrice || 0) * 0.45) || 27;
    }

    const createOrderResp = await authed("POST", "/api/store-admin/orders", {
      customer_id: unlinked.id,
      status: "pending_payment",
      payment_status: "unpaid",
      subtotal: unitPrice,
      total_amount: unitPrice,
      total_cost: unitCost,
      gross_profit: unitPrice - unitCost,
      note: "phase53c bound line smoke",
      items: [
        {
          product_id: selectedProduct.id,
          quantity: 1,
          unit_price: unitPrice,
          unit_cost: unitCost,
        },
      ],
    });
    summary.actions.create_order = createOrderResp.ok ? "pass" : "fail";
    if (!createOrderResp.ok || !createOrderResp.body?.id) {
      abortFlow(summary, "FLOW_CREATE_ORDER_FAILED", "Create order failed");
    }

    const orderId = createOrderResp.body.id;
    summary.ids.order_id = orderId;

    const createPaymentResp = await authed("POST", `/api/store-admin/orders/${orderId}/payments`, {
      amount: unitPrice,
      method: "promptpay",
      slip_url: "mock://phase53c-slip-create",
    });
    summary.actions.create_payment = createPaymentResp.ok ? "pass" : "fail";
    if (!createPaymentResp.ok || !createPaymentResp.body?.id) {
      abortFlow(summary, "FLOW_CREATE_PAYMENT_FAILED", "Create payment failed");
    }

    const paymentId = createPaymentResp.body.id;
    summary.ids.payment_id = paymentId;

    const submitResp = await authed("POST", `/api/store-admin/payments/${paymentId}/submit-slip`, {
      slip_url: "mock://phase53c-slip-submitted",
      slip_storage_path: null,
      slip_file_name: "phase53c-slip",
      note: "phase53c submit",
    });
    summary.actions.submit_slip = submitResp.ok ? "pass" : "fail";
    if (!submitResp.ok) {
      abortFlow(summary, "FLOW_SUBMIT_SLIP_FAILED", "Submit payment slip failed");
    }

    const approveResp = await authed("POST", `/api/store-admin/payments/${paymentId}/approve`, {
      note: "phase53c approve",
    });
    summary.actions.approve_payment = approveResp.ok ? "pass" : "fail";
    if (!approveResp.ok) {
      abortFlow(summary, "FLOW_APPROVE_PAYMENT_FAILED", "Approve payment failed");
    }

    const readyResp = await authed("PATCH", `/api/store-admin/orders/${orderId}/status`, {
      status: "ready",
      note: "phase53c ready",
    });
    summary.actions.move_ready = readyResp.ok ? "pass" : "fail";
    if (!readyResp.ok) {
      abortFlow(summary, "FLOW_ORDER_READY_FAILED", "Move order to ready failed");
    }

    const { data: logs, error: logError } = await serviceClient
      .from("line_notification_logs")
      .select("order_id,message_type,send_status,line_user_id,created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    if (logError) {
      summary.verification.line_logs = "fail";
      abortFlow(summary, "VERIFY_LINE_LOGS_FAILED", "Service-role query line_notification_logs failed");
    }

    const lineRows = Array.isArray(logs) ? logs : [];
    const paymentApprovedRows = lineRows.filter((r) => r.message_type === "payment_approved");
    const orderReadyRows = lineRows.filter((r) => r.message_type === "order_ready");

    const latestPaymentApproved = paymentApprovedRows[paymentApprovedRows.length - 1] || null;
    const latestOrderReady = orderReadyRows[orderReadyRows.length - 1] || null;

    const hasBoth = Boolean(latestPaymentApproved && latestOrderReady);
    const paymentUsesBound = latestPaymentApproved?.line_user_id === uniqueLineId;
    const readyUsesBound = latestOrderReady?.line_user_id === uniqueLineId;
    const noFallbackForBound =
      latestPaymentApproved?.line_user_id !== FALLBACK_LINE_USER &&
      latestOrderReady?.line_user_id !== FALLBACK_LINE_USER;

    summary.log_assertions = {
      total_logs_for_order: lineRows.length,
      has_payment_approved_log: Boolean(latestPaymentApproved),
      has_order_ready_log: Boolean(latestOrderReady),
      payment_approved_uses_bound_id: Boolean(paymentUsesBound),
      order_ready_uses_bound_id: Boolean(readyUsesBound),
      no_fallback_for_bound_logs: Boolean(noFallbackForBound),
      bound_line_user_id_masked: lineMask,
    };

    if (!hasBoth || !paymentUsesBound || !readyUsesBound || !noFallbackForBound) {
      summary.verification.line_logs = "fail";
      summary.verification.fallback_not_used_for_bound = "fail";
      abortFlow(summary, "VERIFY_BOUND_LINE_ID_FAILED", "line_notification_logs did not consistently use bound customer line_user_id");
    }

    summary.verification.line_logs = "pass";
    summary.verification.fallback_not_used_for_bound = "pass";

    const customersAfterResp = await authed("GET", "/api/store-admin/customers");
    const customerAfter = Array.isArray(customersAfterResp.body?.items)
      ? customersAfterResp.body.items.find((c) => c.id === unlinked.id)
      : null;

    const maskedReturned = customerAfter?.line_user_id_masked || null;
    const maskLooksSafe = Boolean(maskedReturned && maskedReturned !== uniqueLineId);
    summary.masking_assertions = {
      customer_found: Boolean(customerAfter),
      line_binding_status: customerAfter?.line_binding_status || null,
      returned_masked_value_present: Boolean(maskedReturned),
      returned_value_is_not_full_line_user_id: maskLooksSafe,
      expected_masked: lineMask,
      returned_masked: maskedReturned,
    };

    if (!customerAfter || !maskLooksSafe) {
      summary.verification.customer_masking = "fail";
      abortFlow(summary, "VERIFY_CUSTOMER_MASKING_FAILED", "Customer endpoint masking assertion failed");
    }
    summary.verification.customer_masking = "pass";

    summary.result = "pass";
    summary.failure_code = null;
    summary.next_action = "None";
  } finally {
    if (cleanupNeeded && unlinked?.id) {
      const unbindResp = await authed("DELETE", `/api/store-admin/customers/${unlinked.id}/unbind-line`);
      summary.actions.cleanup_unbind = unbindResp.ok ? "pass" : "fail";
    }
  }

  outputAndExit(summary, summary.result === "pass" ? 0 : 1);
}

main().catch((err) => {
  if (err instanceof FlowAbort) {
    process.exit(err.code);
  }
  const failure = {
    phase: "Phase 5.3C Bound LINE Notification Smoke",
    result: "fail",
    failure_code: "SCRIPT_ERROR",
    next_action: String(err.message || err),
  };
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
});

