#!/usr/bin/env node
import "dotenv/config";

const BACKEND_URL = (process.env.BACKEND_URL || process.env.E2E_BACKEND_URL || "").replace(/\/+$/, "");
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
    bail("request_failed", `GET ${path} failed: ${detail}`);
  }

  return body;
}

function ensureNumber(value, field) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    bail("invalid_metric", `${field} is not a numeric value`);
  }
  return value;
}

async function main() {
  const summary = await fetchJson("/api/store-admin/dashboard-summary");

  ensureNumber(summary.today_orders_count, "today_orders_count");
  ensureNumber(summary.confirmed_revenue_today, "confirmed_revenue_today");
  ensureNumber(summary.pending_revenue_today, "pending_revenue_today");
  const pendingCount = ensureNumber(summary.pending_payment_review_count, "pending_payment_review_count");
  if (pendingCount < 0) {
    bail("invalid_pending_count", "pending_payment_review_count must be >= 0");
  }

  if (!summary.queues || typeof summary.queues !== "object") {
    bail("missing_queues", "queues map not returned");
  }

  const recentOrders = Array.isArray(summary.recent_orders) ? summary.recent_orders : [];
  if (recentOrders.length > 0) {
    const sample = recentOrders[0];
    if (!sample.order_no && !sample.order_id) {
      bail("recent_order_missing_identifier", "recent order is missing order_no/order_id");
    }
    ensureNumber(typeof sample.total_amount === "number" ? sample.total_amount : Number(sample.total_amount || 0), "recent_order.total_amount");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        store_id: summary.store_id,
        today_orders_count: summary.today_orders_count,
        pending_payment_review_count: summary.pending_payment_review_count,
        recent_orders: recentOrders.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => bail("script_failed", err.message));
