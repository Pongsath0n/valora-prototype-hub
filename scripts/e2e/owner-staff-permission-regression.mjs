#!/usr/bin/env node
import process from "node:process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ENV,
  maskedEnvSummary,
  assertLocalFirstUnlessCloud,
  ensureEnvVars,
} from "./env.mjs";

// ── Config ────────────────────────────────────────────────────────────────
const {
  backendUrl: BACKEND_URL,
  frontendUrl: FRONTEND_URL,
  ownerToken: OWNER_TOKEN,
  staffToken: STAFF_TOKEN,
  storeId: STORE_ID,
  productId: PRODUCT_ID,
} = ENV;
const REPORT_DATE = new Date().toISOString().slice(0, 10);

// ── Summary structure ─────────────────────────────────────────────────────
const summary = {
  result: "pending",
  phase: "4.1",
  runtime: { backend: {}, frontend: {} },
  env: {},
  owner: {},
  staff: {},
  frontend_guard_checks: [],
  failures: [],
  recommended_next_action: "",
};

function recordFailure(category, message, detail = {}) {
  summary.failures.push({ category, message, detail });
}

function finish(ok, message) {
  summary.result = ok ? "pass" : "fail";
  if (message) summary.recommended_next_action = message;
  console.log(JSON.stringify(summary, null, 2));
  process.exit(ok ? 0 : 1);
}

function fail(category, message, detail) {
  recordFailure(category, message, detail);
  finish(false, message);
}

// ── Helpers ────────────────────────────────────────────────────────────────
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
  } catch (error) {
    return { ok: false, status: null, body: { error: error.message } };
  }
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function withStoreId(path) {
  if (!STORE_ID) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}store_id=${encodeURIComponent(STORE_ID)}`;
}

// ── Env validation ───────────────────────────────────────────────────────
function validateEnv() {
  summary.env = maskedEnvSummary();
  try {
    ensureEnvVars(["backendUrl", "frontendUrl", "ownerToken", "staffToken", "storeId", "productId"]);
  } catch (error) {
    fail(
      "missing_env",
      "Missing required env values. Populate .env.e2e.local with BACKEND_URL, FRONTEND_URL, OWNER_TOKEN, STAFF_TOKEN, TEST_STORE_ID, CUSTOMER_PRODUCT_ID.",
      { summary: summary.env, missing: error.missing }
    );
  }
}

// ── Runtime readiness ────────────────────────────────────────────────────
async function checkBackend() {
  const resp = await fetchJson(`${BACKEND_URL}/health`);
  summary.runtime.backend = { url: BACKEND_URL, status: resp.status, ok: resp.ok };
  if (!resp.ok) {
    fail("backend_unreachable", `Backend not reachable at ${BACKEND_URL}`, { status: resp.status, body: resp.body });
  }
}

async function checkFrontend() {
  const resp = await fetchJson(FRONTEND_URL);
  summary.runtime.frontend = { url: FRONTEND_URL, status: resp.status, ok: resp.ok };
  if (!resp.ok) {
    recordFailure("frontend_unreachable", `Frontend not reachable at ${FRONTEND_URL}`, { status: resp.status });
  }
}

// ── Auth readiness ───────────────────────────────────────────────────────
async function checkMe(token, label) {
  const resp = await fetchJson(`${BACKEND_URL}/api/store-admin/me`, { headers: auth(token) });
  const section = label === "owner" ? summary.owner : summary.staff;
  section.me_status = resp.status;
  if (!resp.ok) {
    const cat = label === "owner" ? "invalid_owner_token" : "invalid_staff_token";
    fail(cat, `${label} /api/store-admin/me failed`, { status: resp.status, body: resp.body });
  }
  section.role = resp.body?.role || null;
  section.store_id = resp.body?.store_id || null;
  section.user_id = resp.body?.user_id || null;
  section.memberships = (resp.body?.memberships || []).map((m) => ({
    store_id: m.store_id,
    role: m.role,
  }));
  return resp.body;
}

// ── Owner allowed endpoints ──────────────────────────────────────────────
async function ownerAllowedChecks() {
  const checks = [];
  const endpoints = [
    { name: "dashboard-summary", path: "/api/store-admin/dashboard-summary" },
    { name: "reports-sales", path: `/api/store-admin/reports/sales?start_date=${REPORT_DATE}&end_date=${REPORT_DATE}` },
    { name: "channel-pricing", path: "/api/store-admin/channel-pricing" },
  ];
  for (const ep of endpoints) {
    const resp = await fetchJson(`${BACKEND_URL}${withStoreId(ep.path)}`, { headers: auth(OWNER_TOKEN) });
    checks.push({ endpoint: ep.name, status: resp.status, ok: resp.ok });
    if (!resp.ok) {
      fail("owner_business_access_blocked", `Owner denied from ${ep.name}`, { endpoint: ep.name, status: resp.status, body: resp.body });
    }
  }
  summary.owner.endpoint_checks = checks;
}

// ── Staff restricted endpoints ───────────────────────────────────────────
async function staffRestrictedChecks() {
  const checks = [];
  const restricted = [
    { name: "dashboard-summary", path: "/api/store-admin/dashboard-summary", expectDeny: true },
    { name: "reports-sales", path: `/api/store-admin/reports/sales?start_date=${REPORT_DATE}&end_date=${REPORT_DATE}`, expectDeny: true },
    { name: "channel-pricing", path: "/api/store-admin/channel-pricing", expectDeny: true },
  ];
  for (const ep of restricted) {
    const resp = await fetchJson(`${BACKEND_URL}${withStoreId(ep.path)}`, { headers: auth(STAFF_TOKEN) });
    checks.push({ endpoint: ep.name, status: resp.status, ok: resp.ok, expected_deny: ep.expectDeny });
    if (ep.expectDeny && resp.ok) {
      recordFailure("staff_pricing_access_leak", `Staff allowed into restricted endpoint ${ep.name}`, { endpoint: ep.name, status: resp.status });
    }
  }
  summary.staff.restricted_endpoint_checks = checks;
}

// ── Staff allowed endpoints ──────────────────────────────────────────────
async function staffAllowedChecks() {
  const checks = [];
  const allowed = [
    { name: "orders-list", path: "/api/store-admin/orders" },
    { name: "menus-list", path: "/api/store-admin/menus" },
  ];
  for (const ep of allowed) {
    const resp = await fetchJson(`${BACKEND_URL}${withStoreId(ep.path)}`, { headers: auth(STAFF_TOKEN) });
    checks.push({ endpoint: ep.name, status: resp.status, ok: resp.ok });
    if (!resp.ok) {
      recordFailure("api_contract_mismatch", `Staff blocked from expected-allowed endpoint ${ep.name}`, { endpoint: ep.name, status: resp.status, body: resp.body });
    }
  }
  summary.staff.allowed_endpoint_checks = checks;
}

// ── Frontend guard inspection ────────────────────────────────────────────
function inspectFrontendGuards() {
  const root = resolve(process.cwd(), "frontend/src");
  const checks = [];
  const files = [
    { path: resolve(root, "App.tsx"), name: "App.tsx" },
    { path: resolve(root, "components/admin/AdminLayout.tsx"), name: "AdminLayout.tsx" },
    { path: resolve(root, "pages/admin/AdminDashboard.tsx"), name: "AdminDashboard.tsx" },
    { path: resolve(root, "lib/guards.ts"), name: "guards.ts" },
  ];

  for (const f of files) {
    try {
      const content = readFileSync(f.path, "utf-8");
      checks.push({ file: f.name, readable: true, length: content.length });

      if (f.name === "App.tsx") {
        const hasBusinessRoute = content.includes('element={<BusinessRoute><StoreAdminChannelPricingPage');
        checks.push({ file: f.name, guard: "BusinessRoute on /store-admin/channel-pricing", found: hasBusinessRoute });
      }

      if (f.name === "AdminLayout.tsx") {
        const hasRecipeRoleGuard = /roles:\s*\[[^\]]*"owner"[^\]]*"admin"[^\]]*"manager"[^\]]*\]/.test(content);
        const hasPricingRoleGuard = /channel-pricing.*roles:\s*\[[^\]]*"owner"[^\]]*"admin"[^\]]*"manager"[^\]]*\]/.test(content);
        checks.push({ file: f.name, guard: "recipe nav roles restriction", found: hasRecipeRoleGuard });
        checks.push({ file: f.name, guard: "channel-pricing nav roles restriction", found: hasPricingRoleGuard });
      }

      if (f.name === "AdminDashboard.tsx") {
        const hasCardRoleGuard = /ราคาตามช่องทาง[\s\S]*?roles:\s*\[[^\]]*"owner"[^\]]*"admin"[^\]]*"manager"[^\]]*\]/.test(content);
        checks.push({ file: f.name, guard: "channel-pricing card roles restriction", found: hasCardRoleGuard });
      }

      if (f.name === "guards.ts") {
        const businessRoles = /BUSINESS_PORTAL_ROLES[^=]*=\s*\[[^\]]*"owner"[^\]]*"admin"[^\]]*"manager"[^\]]*\]/.test(content);
        const storeAdminRoles = /STORE_ADMIN_ROLES[^=]*=\s*\[[^\]]*"staff"[^\]]*\]/.test(content);
        checks.push({ file: f.name, guard: "BUSINESS_PORTAL_ROLES contains owner/admin/manager", found: businessRoles });
        checks.push({ file: f.name, guard: "STORE_ADMIN_ROLES contains staff", found: storeAdminRoles });
      }
    } catch (e) {
      checks.push({ file: f.name, readable: false, error: e.message });
    }
  }

  summary.frontend_guard_checks = checks;

  // Validate no contradictions
  const appGuard = checks.find((c) => c.guard === "BusinessRoute on /store-admin/channel-pricing");
  const layoutGuard = checks.find((c) => c.guard === "channel-pricing nav roles restriction");
  const cardGuard = checks.find((c) => c.guard === "channel-pricing card roles restriction");

  if (appGuard && !appGuard.found) {
    recordFailure("frontend_guard_mismatch", "App.tsx missing BusinessRoute on /store-admin/channel-pricing", {});
  }
  if (layoutGuard && !layoutGuard.found) {
    recordFailure("frontend_guard_mismatch", "AdminLayout.tsx missing roles restriction on channel-pricing nav", {});
  }
  if (cardGuard && !cardGuard.found) {
    recordFailure("frontend_guard_mismatch", "AdminDashboard.tsx missing roles restriction on channel-pricing card", {});
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  try {
    assertLocalFirstUnlessCloud("Phase 4.1 permission regression");
  } catch (error) {
    fail("local_first_violation", error.message, error.details || {});
  }
  inspectFrontendGuards();
  validateEnv();
  await checkBackend();
  await checkFrontend();

  // Auth readiness
  const ownerMe = await checkMe(OWNER_TOKEN, "owner");
  const staffMe = await checkMe(STAFF_TOKEN, "staff");

  // Verify store_id alignment if available
  if (STORE_ID && ownerMe.store_id && ownerMe.store_id !== STORE_ID) {
    recordFailure("owner_role_resolution_failed", `Owner store_id mismatch: expected ${STORE_ID}, got ${ownerMe.store_id}`, {});
  }
  if (STORE_ID && staffMe.store_id && staffMe.store_id !== STORE_ID) {
    recordFailure("staff_role_resolution_failed", `Staff store_id mismatch: expected ${STORE_ID}, got ${staffMe.store_id}`, {});
  }

  // Role sanity checks
  if (ownerMe.role && !["owner", "admin", "manager"].includes(ownerMe.role)) {
    recordFailure("owner_role_resolution_failed", `Owner role unexpected: ${ownerMe.role}`, {});
  }
  if (staffMe.role && staffMe.role !== "staff") {
    recordFailure("staff_role_resolution_failed", `Staff role unexpected: ${staffMe.role}`, {});
  }

  await ownerAllowedChecks();
  await staffRestrictedChecks();
  await staffAllowedChecks();
  inspectFrontendGuards();

  // Determine pass/fail
  const hasCriticalFailures = summary.failures.some((f) =>
    [
      "missing_env",
      "invalid_owner_token",
      "invalid_staff_token",
      "backend_unreachable",
      "owner_business_access_blocked",
      "staff_pricing_access_leak",
      "frontend_guard_mismatch",
      "local_first_violation",
    ].includes(f.category)
  );

  if (hasCriticalFailures) {
    const categories = [...new Set(summary.failures.map((f) => f.category))].join(", ");
    finish(false, `Critical failures detected: ${categories}. Recommend handing off backend/frontend guard fixes to Codex 5.1.`);
  }

  finish(true, "Phase 4.1 permission regression passed. No critical owner/staff permission defects detected.");
}

main().catch((error) => {
  recordFailure("unknown", error.message, { stack: error.stack });
  finish(false, `Script error: ${error.message}`);
});
