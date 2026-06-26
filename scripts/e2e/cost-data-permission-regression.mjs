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

const {
  backendUrl: BACKEND_URL,
  frontendUrl: FRONTEND_URL,
  ownerToken: OWNER_TOKEN,
  staffToken: STAFF_TOKEN,
  storeId: STORE_ID,
} = ENV;

const summary = {
  result: "pending",
  phase: "4.2",
  runtime: { backend: {}, frontend: {} },
  env: {},
  owner: { role: null, store_id: null, me_status: null, endpoint_checks: [] },
  staff: { role: null, store_id: null, me_status: null, restricted_endpoint_checks: [] },
  sensitive_field_scan: [],
  frontend_guard_checks: [],
  failures: [],
  recommended_next_action: "",
};

const CRITICAL_FAILURES = new Set([
  "missing_env",
  "invalid_owner_token",
  "invalid_staff_token",
  "backend_unreachable",
  "frontend_unreachable",
  "owner_role_resolution_failed",
  "staff_role_resolution_failed",
  "owner_cost_endpoint_blocked",
  "staff_cost_data_exposure",
  "staff_recipe_formula_exposure",
  "frontend_backend_permission_mismatch",
  "api_contract_mismatch",
  "unknown",
  "local_first_violation",
]);

const COST_ENDPOINTS = [
  { key: "ingredients", path: "/api/store-admin/ingredients", exposureCategory: "staff_cost_data_exposure" },
  { key: "recipes", path: "/api/store-admin/recipes", exposureCategory: "staff_recipe_formula_exposure" },
];

const SENSITIVE_FIELDS = [
  "cost_per_unit",
  "unit_cost",
  "total_cost",
  "gross_profit",
  "line_profit",
  "quantity_used",
  "ingredient_id",
  "ingredient_cost_per_unit",
  "ingredients",
  "recipe",
  "formula",
  "margin",
  "profit",
  "api_response",
  "verification_score",
];
const SENSITIVE_FIELD_SET = new Set(SENSITIVE_FIELDS);

function recordFailure(category, message, detail = {}) {
  summary.failures.push({ category, message, detail });
}

function finalize(defaultMessage = "") {
  const hasCritical = summary.failures.some((failure) => CRITICAL_FAILURES.has(failure.category));
  summary.result = hasCritical ? "fail" : "pass";
  if (!summary.recommended_next_action) {
    summary.recommended_next_action = hasCritical
      ? defaultMessage || "Address listed Phase 4.2 failures."
      : "Phase 4.2 cost data permission regression passed.";
  }
  console.log(JSON.stringify(summary, null, 2));
  process.exit(hasCritical ? 1 : 0);
}

function failNow(category, message, detail = {}) {
  recordFailure(category, message, detail);
  if (!summary.recommended_next_action) {
    summary.recommended_next_action = message;
  }
  finalize(message);
}

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

function validateEnv() {
  summary.env = maskedEnvSummary();
  try {
    ensureEnvVars(["backendUrl", "frontendUrl", "ownerToken", "staffToken", "storeId"]);
  } catch (error) {
    failNow("missing_env", "Missing required env values. See summary.env for details.", {
      summary: summary.env,
      missing: error.missing,
    });
  }
}

async function checkBackend() {
  const resp = await fetchJson(`${BACKEND_URL}/health`);
  summary.runtime.backend = { url: BACKEND_URL, status: resp.status, ok: resp.ok };
  if (!resp.ok) {
    failNow("backend_unreachable", `Backend not reachable at ${BACKEND_URL}`, { status: resp.status, body: resp.body });
  }
}

async function checkFrontend() {
  if (!FRONTEND_URL) return;
  const resp = await fetchJson(FRONTEND_URL);
  summary.runtime.frontend = { url: FRONTEND_URL, status: resp.status, ok: resp.ok };
  if (!resp.ok) {
    recordFailure("frontend_unreachable", `Frontend not reachable at ${FRONTEND_URL}`, { status: resp.status });
  }
}

async function checkMe(token, label) {
  const resp = await fetchJson(`${BACKEND_URL}/api/store-admin/me`, { headers: auth(token) });
  const section = label === "owner" ? summary.owner : summary.staff;
  section.me_status = resp.status;
  if (!resp.ok) {
    const category = label === "owner" ? "invalid_owner_token" : "invalid_staff_token";
    failNow(category, `${label} /api/store-admin/me failed`, { status: resp.status, body: resp.body });
  }
  section.role = resp.body?.role || null;
  section.store_id = resp.body?.store_id || null;
  return resp.body;
}

function ensureStoreAlignment(profile, label) {
  if (STORE_ID && profile?.store_id && profile.store_id !== STORE_ID) {
    const category = label === "owner" ? "owner_role_resolution_failed" : "staff_role_resolution_failed";
    recordFailure(category, `${label} store_id mismatch`, { expected: STORE_ID, actual: profile.store_id });
  }
}

function scanSensitiveFields(payload) {
  const hits = [];
  const seen = new Set();

  function walk(value, path) {
    if (value === null || value === undefined) return;
    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (SENSITIVE_FIELD_SET.has(key)) {
        const sample = typeof child === "string" ? child.slice(0, 80) : child;
        hits.push({ field: key, path: nextPath, sample });
      }
      walk(child, nextPath);
    }
  }

  if (payload && typeof payload === "object") {
    walk(payload, "");
  }
  return hits;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectNavRoles(content, path) {
  const regex = new RegExp(`path:\\s*["']${escapeRegex(path)}["'][\\s\\S]{0,200}`);
  const match = content.match(regex);
  if (!match) return null;
  const rolesMatch = match[0].match(/roles:\s*\[([^\]]+)\]/);
  if (!rolesMatch) return null;
  return rolesMatch[1]
    .split(",")
    .map((part) => part.replace(/["'\s]/g, ""))
    .filter(Boolean);
}

function inspectFrontendGuards() {
  const root = resolve(process.cwd(), "frontend/src");
  const files = [
    { path: resolve(root, "App.tsx"), name: "App.tsx" },
    { path: resolve(root, "components/admin/AdminLayout.tsx"), name: "AdminLayout.tsx" },
    { path: resolve(root, "pages/admin/AdminDashboard.tsx"), name: "AdminDashboard.tsx" },
    { path: resolve(root, "lib/guards.ts"), name: "guards.ts" },
  ];

  const checks = [];
  const guardFacts = { ingredientsHidden: false, recipesHidden: false };

  for (const file of files) {
    try {
      const content = readFileSync(file.path, "utf-8");
      checks.push({ file: file.name, readable: true, length: content.length });

      if (file.name === "App.tsx") {
        const routed = content.includes("<BusinessRoute><StoreAdminChannelPricingPage");
        checks.push({ file: file.name, guard: "channel_pricing_business_route", enforced: routed });
      }

      if (file.name === "AdminLayout.tsx") {
        const recipeRoles = detectNavRoles(content, "/owner/recipes");
        const ingredientRoles = detectNavRoles(content, "/owner/cost-items");
        guardFacts.recipesHidden = Array.isArray(recipeRoles) && recipeRoles.length && !recipeRoles.includes("staff");
        guardFacts.ingredientsHidden = Array.isArray(ingredientRoles) && ingredientRoles.length && !ingredientRoles.includes("staff");
        checks.push({ file: file.name, guard: "recipes_nav_roles", roles: recipeRoles });
        checks.push({ file: file.name, guard: "ingredients_nav_roles", roles: ingredientRoles });
      }

      if (file.name === "AdminDashboard.tsx") {
        const cardGuard = /ราคาตามช่องทาง[\s\S]*roles:\s*\[[^\]]+\]/.test(content);
        checks.push({ file: file.name, guard: "dashboard_channel_pricing_card", enforced: cardGuard });
      }

      if (file.name === "guards.ts") {
        const businessRoles = /BUSINESS_PORTAL_ROLES[^=]*=\s*\[[^\]]*owner[^\]]*admin[^\]]*manager[^\]]*\]/.test(content);
        const storeAdminRoles = /STORE_ADMIN_ROLES[^=]*=\s*\[[^\]]*staff[^\]]*\]/.test(content);
        checks.push({ file: file.name, guard: "business_portal_roles", enforced: businessRoles });
        checks.push({ file: file.name, guard: "store_admin_roles_include_staff", enforced: storeAdminRoles });
      }
    } catch (error) {
      checks.push({ file: file.name, readable: false, error: error.message });
    }
  }

  summary.frontend_guard_checks = checks;
  return guardFacts;
}

async function ownerCostChecks() {
  const checks = [];
  for (const ep of COST_ENDPOINTS) {
    const resp = await fetchJson(`${BACKEND_URL}${withStoreId(ep.path)}`, { headers: auth(OWNER_TOKEN) });
    checks.push({ endpoint: ep.key, status: resp.status, ok: resp.ok });
    if (!resp.ok) {
      failNow("owner_cost_endpoint_blocked", `Owner blocked from ${ep.key}`, { status: resp.status, body: resp.body });
    }
  }
  summary.owner.endpoint_checks = checks;
}

async function staffCostChecks(guardFacts) {
  const checks = [];
  for (const ep of COST_ENDPOINTS) {
    const resp = await fetchJson(`${BACKEND_URL}${withStoreId(ep.path)}`, { headers: auth(STAFF_TOKEN) });
    const entry = { endpoint: ep.key, status: resp.status, ok: resp.ok, classification: "" };
    let sensitiveHits = [];

    if (resp.status === 401 || resp.status === 403) {
      entry.classification = "blocked";
    } else if (resp.ok) {
      sensitiveHits = scanSensitiveFields(resp.body);
      if (sensitiveHits.length) {
        entry.classification = ep.exposureCategory;
        recordFailure(ep.exposureCategory, `Staff received sensitive ${ep.key} data`, {
          endpoint: ep.key,
          sensitive_fields: sensitiveHits.slice(0, 5),
        });
        const frontendHides = ep.key === "recipes" ? guardFacts.recipesHidden : guardFacts.ingredientsHidden;
        if (frontendHides) {
          recordFailure(
            "frontend_backend_permission_mismatch",
            `Frontend hides ${ep.key} but backend allowed staff read access`,
            { endpoint: ep.key },
          );
        }
      } else {
        entry.classification = "staff_safe_masked_response";
      }
    } else {
      entry.classification = "api_contract_mismatch";
      recordFailure("api_contract_mismatch", `Unexpected response for staff ${ep.key}`, { status: resp.status, body: resp.body });
    }

    entry.sensitive_fields = sensitiveHits;
    checks.push(entry);
    summary.sensitive_field_scan.push({
      endpoint: ep.key,
      status: resp.status,
      classification: entry.classification,
      sensitive_fields: sensitiveHits,
    });
  }
  summary.staff.restricted_endpoint_checks = checks;
}

async function main() {
  try {
    assertLocalFirstUnlessCloud("Phase 4.2 cost data regression");
  } catch (error) {
    failNow("local_first_violation", error.message, error.details || {});
  }
  validateEnv();
  const guardFacts = inspectFrontendGuards();
  await checkBackend();
  await checkFrontend();

  const ownerProfile = await checkMe(OWNER_TOKEN, "owner");
  const staffProfile = await checkMe(STAFF_TOKEN, "staff");
  ensureStoreAlignment(ownerProfile, "owner");
  ensureStoreAlignment(staffProfile, "staff");

  await ownerCostChecks();
  await staffCostChecks(guardFacts);

  if (
    summary.failures.some((failure) => failure.category === "staff_cost_data_exposure" || failure.category === "staff_recipe_formula_exposure")
  ) {
    summary.recommended_next_action =
      summary.recommended_next_action || "Restrict GET /api/store-admin/ingredients and /api/store-admin/recipes to manager roles only.";
  }

  finalize();
}

main().catch((error) => {
  recordFailure("unknown", error.message, { stack: error.stack });
  finalize(error.message);
});
