#!/usr/bin/env node
import process from "node:process";
import {
  ENV,
  maskedEnvSummary,
  ensureEnvVars,
} from "./env.mjs";

const { backendUrl: BACKEND_URL } = ENV;

const summary = {
  result: "pending",
  backend_url: BACKEND_URL,
  env: {},
  checks: {},
  failures: [],
};

function recordFailure(category, message, detail = {}) {
  summary.failures.push({ category, message, detail });
}

function finish(ok, message) {
  summary.result = ok ? "pass" : "fail";
  summary.recommended_next_action = message;
  console.log(JSON.stringify(summary, null, 2));
  process.exit(ok ? 0 : 1);
}

function fail(category, message, detail = {}) {
  recordFailure(category, message, detail);
  finish(false, message);
}

async function fetchJson(url) {
  try {
    const res = await fetch(url);
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

const MASKED_VALUES = new Set(["configured", "missing"]);
const STORAGE_STATUS_VALUES = new Set(["ok", "manual", "configured", "warning", "action_required", "not_enabled"]);
const PROBE_VALUES = new Set(["ok", "manual", "error", "not_checked"]);

function ensureMasked(obj, label) {
  if (!obj || typeof obj !== "object") {
    fail("masked_value_missing", `${label} missing`, {});
  }
  for (const [key, value] of Object.entries(obj)) {
    if (!MASKED_VALUES.has(String(value))) {
      fail("secret_leak", `${label}.${key} should be masked`, { value });
    }
  }
}

function validateLineReady(body) {
  if (!body || typeof body !== "object") {
    fail("line_ready_invalid", "LINE readiness body missing", { body });
  }

  if ((body.mode || "").toLowerCase() !== "mock") {
    fail("line_mode_invalid", `Expected LINE_SEND_MODE mock, got ${body.mode}`, { mode: body.mode });
  }

  if (body.real_send_enabled !== false) {
    fail("line_real_send_enabled", "real_send_enabled must remain false in mock mode", { real_send_enabled: body.real_send_enabled });
  }

  const checks = body.checks || {};
  const messaging = checks.messaging_api;
  const webhook = checks.webhook;
  const sendMode = checks.send_mode;
  const richMenu = checks.rich_menu;
  const liff = checks.liff;

  ensureMasked(messaging?.variables, "messaging_api.variables");
  ensureMasked(webhook?.variables, "webhook.variables");

  if (!sendMode || sendMode.status !== "mock") {
    fail("line_send_mode_status", "Send mode status must be mock", { sendMode });
  }
  if (!richMenu || richMenu.status !== "manual") {
    fail("line_rich_menu_status", "Rich Menu must be marked manual", { richMenu });
  }
  if (!liff || liff.status !== "not_enabled") {
    fail("line_liff_status", "LIFF should be not_enabled/deferred", { liff });
  }

  summary.checks.line_ready = {
    status: body.status,
    mode: body.mode,
    real_send_enabled: body.real_send_enabled,
  };
}

function validateStorage(body) {
  if (!body || typeof body !== "object" || !body.storage) {
    fail("storage_missing", "Storage response missing storage payload", { body });
  }
  const storage = body.storage;
  if (!Array.isArray(storage.buckets) || storage.buckets.length === 0) {
    fail("storage_buckets_missing", "Storage buckets missing", { storage });
  }
  storage.buckets.forEach((bucket) => {
    if (!STORAGE_STATUS_VALUES.has(String(bucket.status))) {
      fail("storage_status_invalid", `Unexpected storage status ${bucket.status}`, { bucket });
    }
    if (bucket.probe && !PROBE_VALUES.has(String(bucket.probe))) {
      fail("storage_probe_invalid", `Unexpected probe state ${bucket.probe}`, { bucket });
    }
  });
  if (!storage.probe_mode || !["list", "manual"].includes(String(storage.probe_mode))) {
    fail("storage_probe_mode_invalid", "probe_mode must be list/manual", { storage });
  }
  summary.checks.storage = {
    status: body.status,
    probe_mode: storage.probe_mode,
  };
}

function validateEnv(body) {
  if (!body || typeof body !== "object") {
    fail("env_invalid", "Environment body missing", { body });
  }
  const details = body.details || {};
  if (!details.app_env) {
    fail("app_env_missing", "APP_ENV detail missing", { details });
  }
  summary.checks.environment = {
    status: body.status,
    app_env: details.app_env,
  };
}

async function main() {
  summary.env = maskedEnvSummary();
  try {
    ensureEnvVars(["backendUrl"]);
  } catch (error) {
    fail("missing_env", error.message, { missing: error.missing, summary: summary.env });
  }

  const health = await fetchJson(`${BACKEND_URL}/health`);
  summary.checks.backend = { status: health.status };
  if (!health.ok) {
    fail("backend_unreachable", `/health failed (${health.status})`, { response: health.body });
  }

  const env = await fetchJson(`${BACKEND_URL}/health/env`);
  if (!env.ok) {
    fail("env_endpoint_failed", `/health/env failed (${env.status})`, { response: env.body });
  }
  validateEnv(env.body);

  const lineReady = await fetchJson(`${BACKEND_URL}/health/line-ready`);
  if (!lineReady.ok) {
    fail("line_ready_unreachable", `/health/line-ready failed (${lineReady.status})`, { response: lineReady.body });
  }
  validateLineReady(lineReady.body);

  const storage = await fetchJson(`${BACKEND_URL}/health/storage`);
  if (!storage.ok) {
    fail("storage_unreachable", `/health/storage failed (${storage.status})`, { response: storage.body });
  }
  validateStorage(storage.body);

  finish(true, "Health readiness endpoints look good for H2-B");
}

main().catch((error) => {
  recordFailure("script_error", error.message, { stack: error.stack });
  finish(false, `Script error: ${error.message}`);
});
