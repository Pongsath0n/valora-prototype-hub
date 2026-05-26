require("dotenv").config({ path: ".env.e2e.local" });

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error("Missing " + name);
  }
  return value;
}

const config = {
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

  return {
    ok: res.ok,
    status: res.status,
    body,
  };
}

async function main() {
  const summary = {
    env_loaded: true,
    steps: [],
  };

  const auth = await fetchJson(
    `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: config.email,
        password: config.password,
      }),
    }
  );

  summary.steps.push({
    step: "auth",
    status: auth.status,
    ok: auth.ok,
    has_access_token: Boolean(auth.body && auth.body.access_token),
  });

  if (!auth.ok || !auth.body || !auth.body.access_token) {
    summary.final_status = "auth_failed";
    summary.auth_body = auth.body;
    console.log(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  const token = auth.body.access_token;

  const approve = await fetchJson(
    `${config.backendBase}/api/store-admin/payments/${config.paymentId}/approve`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        note: "E2E approval",
      }),
    }
  );

  summary.steps.push({
    step: "approve_payment",
    status: approve.status,
    ok: approve.ok,
  });

  summary.approve = {
    status: approve.status,
    ok: approve.ok,
    body: approve.body,
  };

  const order = await fetchJson(
    `${config.backendBase}/api/store-admin/orders/${config.orderId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  summary.steps.push({
    step: "get_order",
    status: order.status,
    ok: order.ok,
  });

  const payments = await fetchJson(
    `${config.backendBase}/api/store-admin/orders/${config.orderId}/payments`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  summary.steps.push({
    step: "get_order_payments",
    status: payments.status,
    ok: payments.ok,
  });

  const paymentItems = Array.isArray(payments.body)
    ? payments.body
    : payments.body && Array.isArray(payments.body.items)
      ? payments.body.items
      : [];

  const targetPayment =
    paymentItems.find((payment) => payment.id === config.paymentId) || null;

  summary.order = order.body
    ? {
        id: order.body.id,
        status: order.body.status,
        payment_status: order.body.payment_status,
        subtotal: order.body.subtotal,
        total_amount: order.body.total_amount,
        total_cost: order.body.total_cost,
        gross_profit: order.body.gross_profit,
      }
    : null;

  summary.payment = targetPayment
    ? {
        id: targetPayment.id,
        status: targetPayment.status,
        amount: targetPayment.amount,
        method: targetPayment.method,
      }
    : null;

  summary.can_continue_to_status_transitions =
    Boolean(
      approve.ok &&
      order.ok &&
      payments.ok &&
      summary.order &&
      summary.payment &&
      summary.order.status === "accepted" &&
      summary.order.payment_status === "paid" &&
      summary.payment.status === "paid"
    );

  summary.final_status = summary.can_continue_to_status_transitions
    ? "ready_for_status_transitions"
    : "not_ready";

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        final_status: "script_error",
        message: error.message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});