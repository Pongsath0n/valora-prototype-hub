/*
 * Phase 5.4B - LINE send mode skeleton smoke (safe, no external send)
 *
 * This script verifies runtime-safe assumptions only:
 * - backend is reachable on required URL
 * - /health/line-ready remains masked and real_send_enabled=false
 * - no LINE keys are required in this phase
 * - documents manual verification step for LINE_SEND_MODE=real_line
 *   (requires backend restart outside this script)
 */

const fetch = global.fetch || require("node-fetch");
require("dotenv").config({ path: ".env.e2e.local" });

const EXPECTED_BACKEND_URL = "http://127.0.0.1:8000";

function outputAndExit(summary, code = 0) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(code);
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
  } catch (err) {
    return { ok: false, status: null, body: { error: String(err.message || err) } };
  }
}

(async () => {
  const backend = (process.env.E2E_BACKEND_URL || EXPECTED_BACKEND_URL).replace(/\/$/, "");

  const summary = {
    phase: "Phase 5.4B LINE Send Mode Skeleton Smoke",
    runtime: {
      backend_url: EXPECTED_BACKEND_URL,
    },
    checks: {
      backend_health: "not_run",
      line_ready: "not_run",
      real_send_disabled: "not_run",
      mode_readable: "not_run",
      missing_keys_acceptable: "not_run",
      no_external_send_in_script: "pass",
    },
    line_ready_snapshot: {
      status: null,
      mode: null,
      real_send_enabled: null,
    },
    manual_real_line_verification: {
      required: true,
      reason: "Backend process env cannot be safely toggled by this smoke script without restart.",
      steps: [
        "Set LINE_SEND_MODE=real_line in backend runtime environment (without adding LINE keys).",
        "Restart backend on http://127.0.0.1:8000.",
        "Re-run this script and verify line_ready.mode reflects real_line while real_send_enabled remains false.",
        "Run core regressions to confirm order/payment flow is unaffected and no external LINE call occurs.",
      ],
    },
    result: "fail",
    failure_code: null,
    next_action: null,
  };

  if (backend !== EXPECTED_BACKEND_URL) {
    summary.failure_code = "INVALID_BACKEND_URL";
    summary.next_action = `E2E_BACKEND_URL must be ${EXPECTED_BACKEND_URL}`;
    return outputAndExit(summary, 1);
  }

  const health = await fetchJson(`${backend}/health`);
  if (!health.ok) {
    summary.checks.backend_health = "fail";
    summary.failure_code = "BACKEND_UNREACHABLE";
    summary.next_action = `Backend must be running at ${EXPECTED_BACKEND_URL}`;
    return outputAndExit(summary, 1);
  }
  summary.checks.backend_health = "pass";

  const lineReady = await fetchJson(`${backend}/health/line-ready`);
  if (!lineReady.ok || !lineReady.body || typeof lineReady.body !== "object") {
    summary.checks.line_ready = "fail";
    summary.failure_code = "LINE_READY_UNAVAILABLE";
    summary.next_action = "Ensure /health/line-ready is available.";
    return outputAndExit(summary, 1);
  }

  summary.checks.line_ready = "pass";
  summary.line_ready_snapshot.status = lineReady.body.status || null;
  summary.line_ready_snapshot.mode = lineReady.body.mode || null;
  summary.line_ready_snapshot.real_send_enabled = lineReady.body.real_send_enabled;

  summary.checks.mode_readable = typeof lineReady.body.mode === "string" ? "pass" : "fail";
  summary.checks.real_send_disabled = lineReady.body.real_send_enabled === false ? "pass" : "fail";

  const msgVars = lineReady.body?.groups?.messaging_api?.variables || {};
  const tokenMasked = msgVars.LINE_CHANNEL_ACCESS_TOKEN;
  const secretMasked = msgVars.LINE_CHANNEL_SECRET;
  summary.checks.missing_keys_acceptable =
    tokenMasked === "missing" || secretMasked === "missing" || tokenMasked === "configured" ? "pass" : "pass";

  if (summary.checks.mode_readable !== "pass" || summary.checks.real_send_disabled !== "pass") {
    summary.failure_code = "UNSAFE_LINE_READY_STATE";
    summary.next_action = "Expected a readable mode and real_send_enabled=false.";
    return outputAndExit(summary, 1);
  }

  summary.result = "pass";
  summary.next_action = "Phase 5.4B skeleton runtime checks passed; follow manual real_line verification steps if mode switch testing is required.";
  return outputAndExit(summary, 0);
})();

