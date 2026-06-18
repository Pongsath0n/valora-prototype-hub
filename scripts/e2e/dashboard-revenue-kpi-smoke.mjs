#!/usr/bin/env node
import process from "node:process";
import {
  ENV,
  ensureEnvVars,
  maskedEnvSummary,
  assertLocalFirstUnlessCloud,
} from "./env.mjs";

const summary = {
  result: "pending",
  checks: [],
  failures: [],
  env: {},
};

function recordCheck(name, status, detail = {}) {
  summary.checks.push({ name, status, detail });
}

function recordFailure(category, message, detail = {}) {
  summary.failures.push({ category, message, detail });
}

function finish(ok, message) {
  summary.result = ok ? "pass" : "fail";
  if (message) summary.message = message;
  console.log(JSON.stringify(summary, null, 2));
  process.exit(ok ? 0 : 1);
}

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
  return { ok: res.ok, status: res.status, body };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function buildDashboardSummaryUrl(params = {}) {
  const url = new URL(`${ENV.backendUrl}/api/store-admin/dashboard-summary`);
  if (params.revenue_range) url.searchParams.set("revenue_range", params.revenue_range);
  if (params.start_date) url.searchParams.set("start_date", params.start_date);
  if (params.end_date) url.searchParams.set("end_date", params.end_date);
  return url.toString();
}

async function ownerAllTimeSummary() {
  try {
    const resp = await fetchJson(buildDashboardSummaryUrl(), { headers: auth(ENV.ownerToken) });
    if (!resp.ok) {
      recordFailure("owner_revenue_all_time", "All-time summary failed", resp);
      return;
    }
    const kpi = resp.body?.dashboard_revenue_kpi;
    recordCheck("owner_revenue_all_time", "ok", {
      has_kpi: Boolean(kpi),
      range: kpi?.range,
      total_sales_amount: kpi?.total_sales_amount,
    });
  } catch (error) {
    recordFailure("owner_revenue_all_time", error.message);
  }
}

async function ownerCustomRangeSummary() {
  const params = { revenue_range: "custom", start_date: "2024-01-01", end_date: "2024-01-31" };
  try {
    const resp = await fetchJson(buildDashboardSummaryUrl(params), { headers: auth(ENV.ownerToken) });
    if (!resp.ok) {
      recordFailure("owner_revenue_custom", "Custom range summary failed", resp);
      return;
    }
    const kpi = resp.body?.dashboard_revenue_kpi;
    recordCheck("owner_revenue_custom", "ok", {
      range: kpi?.range,
      start_date: kpi?.start_date,
      end_date: kpi?.end_date,
      order_count: kpi?.total_sales_order_count,
    });
  } catch (error) {
    recordFailure("owner_revenue_custom", error.message);
  }
}

async function ownerInvalidCustomRange() {
  const params = { revenue_range: "custom", start_date: "2024-03-10" }; // missing end date
  try {
    const resp = await fetchJson(buildDashboardSummaryUrl(params), { headers: auth(ENV.ownerToken) });
    if (resp.ok) {
      recordFailure("owner_revenue_invalid_custom", "Invalid custom range should not succeed", resp);
      return;
    }
    recordCheck("owner_revenue_invalid_custom", "ok", { status: resp.status, detail: resp.body?.detail });
  } catch (error) {
    recordFailure("owner_revenue_invalid_custom", error.message);
  }
}

async function staffRevenueAccessDenied() {
  try {
    const resp = await fetchJson(buildDashboardSummaryUrl(), { headers: auth(ENV.staffToken) });
    if (resp.ok) {
      recordFailure("staff_revenue_access", "Staff should not access dashboard summary", resp);
    } else {
      recordCheck("staff_revenue_access", "ok", { status: resp.status });
    }
  } catch (error) {
    recordFailure("staff_revenue_access", error.message);
  }
}

async function main() {
  summary.env = maskedEnvSummary();
  try {
    assertLocalFirstUnlessCloud("dashboard-revenue-kpi-smoke");
  } catch (error) {
    recordFailure("local_policy", error.message, error.details || {});
    finish(false, "Local-first policy violated");
    return;
  }

  try {
    ensureEnvVars(["backendUrl", "ownerToken", "staffToken"]);
  } catch (error) {
    recordFailure("missing_env", error.message, error.summary || {});
    finish(false, "Missing required env values for smoke test");
    return;
  }

  await ownerAllTimeSummary();
  await ownerCustomRangeSummary();
  await ownerInvalidCustomRange();
  await staffRevenueAccessDenied();

  const ok = summary.failures.length === 0;
  finish(ok, ok ? "dashboard revenue KPI smoke passed" : "dashboard revenue KPI smoke failed");
}

await main();
