require("dotenv").config({ path: ".env.e2e.local" });

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing " + name);
  return value;
}

const cfg = {
  supabaseUrl: requireEnv("E2E_SUPABASE_URL").replace(/\/$/, ""),
  anonKey: requireEnv("E2E_SUPABASE_ANON_KEY"),
  orderId: requireEnv("E2E_ORDER_ID"),
  paymentId: requireEnv("E2E_PAYMENT_ID"),
};

async function fetchJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      ...(init.headers || {}),
    },
  });
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
  const results = {};

  results.payment_logs = await fetchJson(
    `${cfg.supabaseUrl}/rest/v1/payment_status_logs?order_id=eq.${cfg.orderId}&payment_id=eq.${cfg.paymentId}&select=payment_id,order_id,from_status,to_status,changed_by_type,note,created_at&order=created_at.asc`
  );

  results.order_logs = await fetchJson(
    `${cfg.supabaseUrl}/rest/v1/order_status_logs?order_id=eq.${cfg.orderId}&select=order_id,from_status,to_status,changed_by_type,note,created_at&order=created_at.asc`
  );

  results.line_logs = await fetchJson(
    `${cfg.supabaseUrl}/rest/v1/line_notification_logs?order_id=eq.${cfg.orderId}&select=order_id,message_type,send_status,message_payload,created_at&order=created_at.asc`
  );

  console.log(
    JSON.stringify(
      {
        final: "ok",
        payment_logs: results.payment_logs,
        order_logs: results.order_logs,
        line_logs: results.line_logs,
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
