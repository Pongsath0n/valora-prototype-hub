#!/usr/bin/env node
import process from "node:process";
import {
  ENV,
  maskedEnvSummary,
  ensureEnvVars,
  assertLocalFirstUnlessCloud,
  invalidTokenError,
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

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function main() {
  summary.env = maskedEnvSummary();
  try {
    assertLocalFirstUnlessCloud("planning-baseline-smoke");
  } catch (error) {
    recordFailure("local_policy", error.message, error.details || {});
    finish(false, "Local-first policy violated");
    return;
  }

  try {
    ensureEnvVars(["backendUrl", "ownerToken", "staffToken"]);
  } catch (error) {
    recordFailure("missing_env", error.message, error.summary || {});
    finish(false, "Missing env values for planning baseline smoke test");
    return;
  }

  await ownerBaselineCheck();
  await staffForbiddenCheck();
  await unauthenticatedDeniedCheck();

  const ok = summary.failures.length === 0;
  finish(ok, ok ? "planning baseline smoke passed" : "planning baseline smoke failed");
}

async function ownerBaselineCheck() {
  const url = `${ENV.backendUrl}/api/store-admin/planning/baseline`;
  try {
    const resp = await fetchJson(url, {
      headers: authHeaders(ENV.ownerToken),
    });
    if (resp.status === 401) {
      throw invalidTokenError("owner", resp.body || resp.status);
    }
    if (!resp.ok) {
      recordFailure("owner_baseline", "Owner baseline request failed", resp);
      return;
    }
    const validation = validateBaselineShape(resp.body || {});
    recordCheck("owner_baseline", "ok", validation);
  } catch (error) {
    if (error?.code === "INVALID_TOKEN") {
      recordFailure("owner_token", error.message, { detail: error.detail });
    } else {
      recordFailure("owner_baseline", error.message);
    }
  }
}

async function staffForbiddenCheck() {
  const url = `${ENV.backendUrl}/api/store-admin/planning/baseline`;
  try {
    const resp = await fetchJson(url, {
      headers: authHeaders(ENV.staffToken),
    });
    if (resp.status === 401) {
      throw invalidTokenError("staff", resp.body || resp.status);
    }
    if (resp.status !== 403) {
      recordFailure("staff_forbidden", "Staff was not blocked", resp);
      return;
    }
    recordCheck("staff_forbidden", "ok", { status: resp.status });
  } catch (error) {
    if (error?.code === "INVALID_TOKEN") {
      recordFailure("staff_token", error.message, { detail: error.detail });
    } else {
      recordFailure("staff_forbidden", error.message);
    }
  }
}

async function unauthenticatedDeniedCheck() {
  const url = `${ENV.backendUrl}/api/store-admin/planning/baseline`;
  try {
    const resp = await fetchJson(url);
    if (resp.ok) {
      recordFailure("unauthenticated_access", "Unauthenticated request succeeded", resp);
      return;
    }
    recordCheck("unauthenticated_blocked", "ok", { status: resp.status });
  } catch (error) {
    recordFailure("unauthenticated_access", error.message);
  }
}

function validateBaselineShape(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Baseline response must be an object");
  }
  const store = body.store;
  if (!store || typeof store !== "object") {
    throw new Error("store metadata missing");
  }
  if (!store.id) throw new Error("store.id missing");
  if (!store.generated_at) throw new Error("store.generated_at missing");

  const baseline = body.baseline;
  if (!baseline || typeof baseline !== "object") {
    throw new Error("baseline metadata missing");
  }
  if (!baseline.cost_source) throw new Error("baseline.cost_source missing");

  if (!Array.isArray(body.items)) {
    throw new Error("items must be an array");
  }

  const sample = body.items[0];
  if (sample) {
    if (!sample.product_id) throw new Error("item.product_id missing");
    if (typeof sample.base_price !== "number") throw new Error("item.base_price missing");
    if (!("cost_status" in sample)) throw new Error("item.cost_status missing");
    if (!sample.name) throw new Error("item.name missing");
  }

  if (!Array.isArray(body.warnings)) {
    throw new Error("warnings must be an array");
  }

  return {
    item_count: body.items.length,
    mix_source: baseline.mix_source,
    warnings: body.warnings,
  };
}

await main();
