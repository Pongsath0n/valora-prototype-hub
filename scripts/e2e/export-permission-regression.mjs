#!/usr/bin/env node
import process from "node:process";
import {
  ENV,
  maskedEnvSummary,
  assertLocalFirstUnlessCloud,
  ensureEnvVars,
} from "./env.mjs";

const {
  backendUrl: BACKEND_URL,
  ownerToken: OWNER_TOKEN,
  staffToken: STAFF_TOKEN,
  storeId: STORE_ID,
} = ENV;

const summary = {
  result: "pending",
  env: {},
  checks: [],
  failures: [],
};

const SENSITIVE_TOKENS = [
  "cost_per_unit",
  "ingredient_cost_per_unit",
  "unit_cost",
  "total_cost",
  "gross_profit",
  "gross_margin",
  "margin",
  "profit",
  "line_cost",
  "line_profit",
  "channel_fee",
  "total_channel_fee",
  "quantity_used",
  "recipe",
  "recipes",
  "ingredient_id",
  "ingredients",
  "supplier_cost",
];

function withStoreId(path) {
  if (!STORE_ID) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}store_id=${encodeURIComponent(STORE_ID)}`;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function recordCheck(entry) {
  summary.checks.push(entry);
}

function recordFailure(category, message, detail = {}) {
  summary.failures.push({ category, message, detail });
}

function fail(category, message, detail = {}) {
  recordFailure(category, message, detail);
  finish(false);
}

function finish(ok) {
  summary.result = ok && summary.failures.length === 0 ? "pass" : "fail";
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.result === "pass" ? 0 : 1);
}

async function fetchCsv(path, token) {
  const url = `${BACKEND_URL}${withStoreId(path)}`;
  try {
    const res = await fetch(url, {
      headers: {
        ...auth(token),
        Accept: "text/csv",
      },
    });
    const text = await res.text();
    return { url, status: res.status, ok: res.ok, text };
  } catch (error) {
    fail("network_error", `Failed to reach ${url}` , { error: error.message });
  }
}

function scanSensitiveTokens(csvText) {
  const findings = [];
  for (const token of SENSITIVE_TOKENS) {
    const pattern = new RegExp(`(^|[^a-z0-9_])${token}([^a-z0-9_]|$)`, "i");
    if (pattern.test(csvText)) {
      findings.push(token);
    }
  }
  return { safe: findings.length === 0, findings };
}

async function staffOrdersExport() {
  const resp = await fetchCsv("/api/store-admin/orders/export", STAFF_TOKEN);
  const check = { case: "staff_orders_export", status: resp.status, ok: resp.ok };
  if (!resp.ok) {
    check.error = `expected 200 got ${resp.status}`;
    recordCheck(check);
    fail("staff_orders_export_failed", "Staff orders export did not return 200", check);
  }
  const scan = scanSensitiveTokens(resp.text.toLowerCase());
  check.forbidden_hits = scan.findings;
  recordCheck(check);
  if (!scan.safe) {
    fail("staff_orders_sensitive_leak", "Sensitive fields found in staff orders export", check);
  }
}

async function staffPaymentsExport() {
  const resp = await fetchCsv("/api/store-admin/payments/export", STAFF_TOKEN);
  const check = { case: "staff_payments_export", status: resp.status, ok: resp.ok };
  if (!resp.ok) {
    check.error = `expected 200 got ${resp.status}`;
    recordCheck(check);
    fail("staff_payments_export_failed", "Staff payments export did not return 200", check);
  }
  const scan = scanSensitiveTokens(resp.text.toLowerCase());
  check.forbidden_hits = scan.findings;
  recordCheck(check);
  if (!scan.safe) {
    fail("staff_payments_sensitive_leak", "Sensitive fields found in staff payments export", check);
  }
}

async function staffSalesExportDenied() {
  const resp = await fetchCsv("/api/store-admin/reports/sales/export", STAFF_TOKEN);
  const check = { case: "staff_sales_export", status: resp.status, ok: resp.ok };
  recordCheck(check);
  if (resp.status !== 403) {
    fail("staff_sales_export_leak", "Staff sales report export should return 403", check);
  }
}

async function ownerSalesExportAllowed() {
  const resp = await fetchCsv("/api/store-admin/reports/sales/export", OWNER_TOKEN);
  const check = { case: "owner_sales_export", status: resp.status, ok: resp.ok };
  if (!resp.ok) {
    check.error = `expected 200 got ${resp.status}`;
    recordCheck(check);
    fail("owner_sales_export_failed", "Owner sales report export failed", check);
  }
  check.record_count = resp.text.split(/\r?\n/).length - 1;
  recordCheck(check);
}

async function main() {
  try {
    assertLocalFirstUnlessCloud("export-permission-regression");
  } catch (error) {
    fail("local_first_violation", error.message, error.details || {});
  }

  summary.env = maskedEnvSummary();
  try {
    ensureEnvVars(["backendUrl", "ownerToken", "staffToken", "storeId"]);
  } catch (error) {
    fail("missing_env", "Missing required env values for export permission regression", {
      summary: summary.env,
      missing: error.missing,
    });
  }

  await staffOrdersExport();
  await staffPaymentsExport();
  await staffSalesExportDenied();
  await ownerSalesExportAllowed();

  finish(true);
}

main().catch((error) => {
  recordFailure("unknown", error.message, { stack: error.stack });
  finish(false);
});
