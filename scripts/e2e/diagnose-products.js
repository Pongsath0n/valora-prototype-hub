/*
 * Phase 4 product visibility diagnostic (backend store-admin API)
 * Safe output only: count, product id, name, price.
 */

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const { createRequire } = require("module");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

async function main() {
  const envPath = path.resolve(__dirname, "../..", ".env.e2e.local");
  if (!fs.existsSync(envPath)) fail(".env.e2e.local not found");
  dotenv.config({ path: envPath });

  const required = ["E2E_BACKEND_URL", "E2E_SUPABASE_URL", "E2E_SUPABASE_ANON_KEY", "E2E_EMAIL", "E2E_PASSWORD"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) fail(`Missing env: ${missing.join(",")}`);

  const backendUrl = process.env.E2E_BACKEND_URL;
  if (backendUrl !== "http://127.0.0.1:8000") {
    fail(`Invalid E2E_BACKEND_URL: ${backendUrl || "<empty>"}`);
  }

  const requireFromFrontend = createRequire(path.resolve(__dirname, "../../frontend/package.json"));
  const { createClient } = requireFromFrontend("@supabase/supabase-js");
  const supabase = createClient(process.env.E2E_SUPABASE_URL, process.env.E2E_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.E2E_EMAIL,
    password: process.env.E2E_PASSWORD,
  });
  if (error || !data?.session?.access_token) {
    fail(`Auth failed: ${error?.message || "no_token"}`);
  }

  const token = data.session.access_token;
  const targetProductId = "856728a7-24b1-4cc1-90bc-961559245cdf";

  const res = await fetch(`${backendUrl}/api/store-admin/menus`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {}
    fail(`Backend /api/store-admin/menus failed: ${res.status}${bodyText ? ` ${bodyText}` : ""}`);
  }

  const body = await res.json();
  const items = Array.isArray(body?.items) ? body.items : [];
  const simplified = items.map((p) => ({
    id: p.id,
    name: p.name,
    base_price: p.base_price ?? p.price ?? null,
  }));

  const target = simplified.find((p) => p.id === targetProductId) || null;

  console.log(
    JSON.stringify(
      {
        backend: backendUrl,
        count: simplified.length,
        target_found: Boolean(target),
        target,
        items: simplified,
      },
      null,
      2
    )
  );
}

main().catch((err) => fail(err?.message || "unexpected_error"));
