/*
 * Phase 4.2.3 - Service-role truth audit for line_notification_logs
 * Safe output only; no secrets printed.
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { createRequire } = require("module");

function loadEnvIfExists(p) {
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
}

function fail(msg, extra = {}) {
  console.error(JSON.stringify({ ok: false, error: msg, ...extra }, null, 2));
  process.exit(1);
}

(async () => {
  // Load env from common locations without printing values
  const root = path.resolve(__dirname, ".."); // scripts/e2e -> scripts
  loadEnvIfExists(path.resolve(root, "..", ".env"));
  loadEnvIfExists(path.resolve(root, "..", ".env.local"));
  loadEnvIfExists(path.resolve(root, "..", ".env.e2e.local"));
  loadEnvIfExists(path.resolve(root, "..", "backend", ".env"));
  loadEnvIfExists(path.resolve(root, "..", "backend", ".env.local"));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.E2E_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    const missing = [];
    if (!supabaseUrl) missing.push("SUPABASE_URL");
    if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    console.log(
      JSON.stringify(
        {
          ok: false,
          service_role_available: false,
          missing_env: missing,
          message: "SERVICE_ROLE_ENV_MISSING",
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  // Use supabase-js from frontend deps
  const requireFrontend = createRequire(path.resolve(__dirname, "../../frontend/package.json"));
  const { createClient } = requireFrontend("@supabase/supabase-js");

  const client = createClient(supabaseUrl.replace(/\/$/, ""), serviceRoleKey);
  const targetOrderId = "720edf40-e2cf-498b-82eb-d6eae4237d6b";

  const { data, error, status } = await client
    .from("line_notification_logs")
    .select("order_id,message_type,send_status,line_user_id,created_at")
    .eq("order_id", targetOrderId)
    .order("created_at", { ascending: true });

  if (error) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          service_role_available: true,
          query_ok: false,
          status,
          error: error.message || String(error),
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const rows = Array.isArray(data) ? data : [];
  const message_types = [...new Set(rows.map((r) => r.message_type))];
  const send_status = [...new Set(rows.map((r) => r.send_status))];
  const line_user_present = rows.some((r) => !!r.line_user_id);
  const created_at = rows.map((r) => r.created_at).filter(Boolean);

  console.log(
    JSON.stringify(
      {
        ok: true,
        service_role_available: true,
        query_ok: true,
        count: rows.length,
        message_types,
        send_status,
        line_user_present,
        created_at,
      },
      null,
      2
    )
  );
})();
