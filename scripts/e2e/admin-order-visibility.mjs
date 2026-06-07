#!/usr/bin/env node
import "dotenv/config";

const BACKEND_URL = (process.env.BACKEND_URL || process.env.E2E_BACKEND_URL || "").replace(/\/$/, "");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.E2E_ADMIN_TOKEN || "";
function bail(message, detail) {
  console.error(JSON.stringify({ ok: false, message, detail }, null, 2));
  process.exit(1);
}

if (!BACKEND_URL) {
  bail("missing_backend_url", "Set BACKEND_URL env (e.g. http://127.0.0.1:8000)");
}

if (!ADMIN_TOKEN) {
  bail("missing_admin_token", "Set ADMIN_TOKEN env to a valid store-admin bearer token");
}

async function fetchJson(path) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      "Content-Type": "application/json",
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
  if (!res.ok) {
    const detail = typeof body === "object" && body !== null ? body.detail || body.error : body;
    throw new Error(`Request failed ${res.status}: ${detail}`);
  }
  return body;
}

function ensureOrderVisibility(orders) {
  if (!orders?.items?.length) {
    bail("orders_empty", "No orders returned for admin store scope");
  }
  const target = orders.items.find((o) => o.order_no || o.latest_payment);
  if (!target) {
    bail("order_missing_order_no", "Orders list missing order_no entries");
  }
  if (!target.latest_payment) {
    bail("order_missing_latest_payment", "Orders do not include latest_payment summary");
  }
  return target;
}

function ensurePaymentQueue(payments, orderNo) {
  const queue = payments.payment_queue || [];
  if (!queue.length) {
    bail("payment_queue_empty", "Payment queue returned empty list");
  }
  const match = queue.find((p) => (p.order_no || p.order_id) === orderNo || (p.order_id && orderNo && orderNo.includes(p.order_id.slice(-6))));
  if (!match) {
    bail("payment_queue_missing_order", `Payment queue missing target order ${orderNo}`);
  }
  if (!match.slip_submitted) {
    bail("payment_queue_missing_slip", "Payment queue entry lacks slip_submitted flag");
  }
  if (!match.customer_name && !match.customer_phone) {
    bail("payment_queue_missing_customer", "Payment queue entry missing customer identity");
  }
  return match;
}

async function main() {
  const orders = await fetchJson("/api/store-admin/orders");
  const visibleOrder = ensureOrderVisibility(orders);

  const payments = await fetchJson("/api/store-admin/payments");
  const queueMatch = ensurePaymentQueue(payments, visibleOrder.order_no || visibleOrder.id);

  console.log(
    JSON.stringify(
      {
        ok: true,
        store_id: orders.store_id || payments.store_id,
        order_no: visibleOrder.order_no,
        payment_id: queueMatch.id,
        message: "Admin order/payment visibility looks healthy",
      },
      null,
      2,
    ),
  );
}

main().catch((err) => bail("script_failed", err.message));

