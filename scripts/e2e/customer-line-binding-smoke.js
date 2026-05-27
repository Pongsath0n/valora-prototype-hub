/*
 * Phase 5.3A - Customer ↔ line_user_id binding smoke test (mock/key-ready)
 * - No real LINE API calls
 * - Uses mock line_user_id (Uphase53a_test_<timestamp>)
 * - Requires Store Admin auth via existing E2E env
 */

const { createRequire } = require("module");
const requireFrom = createRequire(process.cwd() + "/frontend/node_modules");
const { createClient } = requireFrom("@supabase/supabase-js");
const crypto = require("crypto");
const fetch = global.fetch || require("node-fetch");
require("dotenv").config({ path: ".env.e2e.local" });
require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: "backend/.env" });

const backend = "http://127.0.0.1:8000";
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

if (!supabaseUrl || !anonKey) {
  console.error("Missing Supabase anon env");
  process.exit(1);
}

const anonClient = createClient(supabaseUrl, anonKey);
const adminClient = serviceKey ? createClient(supabaseUrl, serviceKey) : null;

function maskLineUserId(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length <= 4) return "***";
  if (s.length <= 8) return `${s.slice(0, 2)}...${s.slice(-2)}`;
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

async function login() {
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw new Error("auth_failed");
  return data.session.access_token;
}

async function getAnyCustomer(token) {
  const res = await fetch(`${backend}/api/store-admin/orders?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`orders_query_failed_${res.status}`);
  const body = await res.json();
  const firstOrder = body.items?.[0];
  if (firstOrder?.customer_id) return { customer_id: firstOrder.customer_id, store_id: firstOrder.store_id };
  // fallback: list customers directly via service client
  if (!adminClient) throw new Error("no_customer_and_no_service_key");
  const { data, error } = await adminClient.from("customers").select("id, store_id").limit(1);
  if (error || !data?.length) throw new Error("no_customers_available");
  return { customer_id: data[0].id, store_id: data[0].store_id };
}

async function bind(token, customerId, lineUserId) {
  const res = await fetch(`${backend}/api/store-admin/customers/${customerId}/bind-line`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ line_user_id: lineUserId }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function unbind(token, customerId) {
  const res = await fetch(`${backend}/api/store-admin/customers/${customerId}/unbind-line`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

(async () => {
  try {
    const token = await login();
    const { customer_id } = await getAnyCustomer(token);
    const lineId = `Uphase53a_test_${crypto.randomBytes(6).toString("hex")}`;

    const first = await bind(token, customer_id, lineId);
    const second = await bind(token, customer_id, lineId); // idempotent
    const unb = await unbind(token, customer_id);

    console.log(
      JSON.stringify(
        {
          customer_id,
          line_user_id_masked: maskLineUserId(lineId),
          results: { first, second, unbind: unb },
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error(JSON.stringify({ error: String(err.message || err) }, null, 2));
    process.exit(1);
  }
})();
