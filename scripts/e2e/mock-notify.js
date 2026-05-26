require("dotenv").config({ path: ".env.e2e.local" });

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing " + name);
  return value;
}

const cfg = {
  backendBase: requireEnv("E2E_BACKEND_URL").replace(/\/$/, ""),
  supabaseUrl: requireEnv("E2E_SUPABASE_URL").replace(/\/$/, ""),
  anonKey: requireEnv("E2E_SUPABASE_ANON_KEY"),
  email: requireEnv("E2E_EMAIL"),
  password: requireEnv("E2E_PASSWORD"),
};

async function fetchJson(url, init = {}) {
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
}

async function main() {
  const steps = [];

  const auth = await fetchJson(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: cfg.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  steps.push({ step: "auth", status: auth.status, ok: auth.ok });
  if (!auth.ok || !auth.body?.access_token) {
    console.log(JSON.stringify({ final: "auth_failed", steps }, null, 2));
    process.exit(1);
  }
  const token = auth.body.access_token;

  const authed = async (step, method, path, body) => {
    const init = {
      method,
      headers: { Authorization: `Bearer ${token}` },
    };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const resp = await fetchJson(`${cfg.backendBase}${path}`, init);
    steps.push({ step, status: resp.status, ok: resp.ok, body: resp.body });
    if (!resp.ok) {
      console.log(JSON.stringify({ final: "failed", steps }, null, 2));
      process.exit(1);
    }
    return resp.body;
  };

  // Create order (no items, minimal totals)
  const order = await authed("create_order", "POST", "/api/store-admin/orders", {
    status: "pending_payment",
    payment_status: "unpaid",
    subtotal: 60,
    total_amount: 60,
    total_cost: 27,
    gross_profit: 33,
    note: "mock notify flow",
  });
  const orderId = order.id;

  // Create payment with slip to enter pending_review
  const pay = await authed("create_payment", "POST", `/api/store-admin/orders/${orderId}/payments`, {
    amount: 60,
    method: "promptpay",
    slip_url: "mock://slip",
  });
  const paymentId = pay.id;

  // Approve payment
  await authed("approve_payment", "POST", `/api/store-admin/payments/${paymentId}/approve`, {
    note: "mock notify approve",
  });

  // Status transitions to trigger ready notification
  await authed("status_preparing", "PATCH", `/api/store-admin/orders/${orderId}/status`, { status: "preparing" });
  await authed("status_ready", "PATCH", `/api/store-admin/orders/${orderId}/status`, { status: "ready" });
  await authed("status_completed", "PATCH", `/api/store-admin/orders/${orderId}/status`, { status: "completed" });

  console.log(
    JSON.stringify(
      {
        final: "ok",
        steps,
        order_id: orderId,
        payment_id: paymentId,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(
    JSON.stringify(
      { final: "script_error", message: err.message, stack: err.stack },
      null,
      2,
    ),
  );
  process.exit(1);
});
