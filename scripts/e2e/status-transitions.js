require("dotenv").config({ path: ".env.e2e.local" });

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error("Missing " + name);
  }
  return value;
}

const cfg = {
  backendBase: requireEnv("E2E_BACKEND_URL").replace(/\/$/, ""),
  supabaseUrl: requireEnv("E2E_SUPABASE_URL").replace(/\/$/, ""),
  anonKey: requireEnv("E2E_SUPABASE_ANON_KEY"),
  email: requireEnv("E2E_EMAIL"),
  password: requireEnv("E2E_PASSWORD"),
  orderId: requireEnv("E2E_ORDER_ID"),
  paymentId: requireEnv("E2E_PAYMENT_ID"),
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
    headers: {
      apikey: cfg.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  steps.push({ step: "auth", status: auth.status, ok: auth.ok, has_token: Boolean(auth.body && auth.body.access_token) });
  if (!auth.ok || !auth.body || !auth.body.access_token) {
    console.log(JSON.stringify({ final: "auth_failed", steps }, null, 2));
    process.exit(1);
  }

  const token = auth.body.access_token;
  const transitions = ["preparing", "ready", "completed"];
  let orderState = null;

  for (const status of transitions) {
    const resp = await fetchJson(`${cfg.backendBase}/api/store-admin/orders/${cfg.orderId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });
    steps.push({ step: `transition_${status}`, status: resp.status, ok: resp.ok, body: resp.body });

    const order = await fetchJson(`${cfg.backendBase}/api/store-admin/orders/${cfg.orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    steps.push({
      step: `get_order_after_${status}`,
      status: order.status,
      ok: order.ok,
      body: order.body
        ? {
            status: order.body.status,
            payment_status: order.body.payment_status,
            total_amount: order.body.total_amount,
          }
        : order.body,
    });

    if (!resp.ok) {
      console.log(JSON.stringify({ final: "failed", steps }, null, 2));
      process.exit(1);
    }

    orderState = order.body;
  }

  const payments = await fetchJson(`${cfg.backendBase}/api/store-admin/orders/${cfg.orderId}/payments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  steps.push({ step: "get_order_payments_final", status: payments.status, ok: payments.ok });

  let payment = null;
  if (payments.body) {
    const items = Array.isArray(payments.body.items)
      ? payments.body.items
      : Array.isArray(payments.body)
        ? payments.body
        : [];
    payment = items.find((p) => p.id === cfg.paymentId) || null;
  }

  console.log(
    JSON.stringify(
      {
        final: "ok",
        steps,
        order: orderState
          ? {
              status: orderState.status,
              payment_status: orderState.payment_status,
              total_amount: orderState.total_amount,
            }
          : null,
        payment: payment
          ? {
              status: payment.status,
              amount: payment.amount,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(
    JSON.stringify(
      {
        final: "script_error",
        message: err.message,
        stack: err.stack,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
