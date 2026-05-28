/*
 * Phase 5.4C - LINE adapter skeleton static smoke
 *
 * Static verification only (no network call to LINE API):
 * - adapter file exists
 * - required skeleton functions exist
 * - disabled skeleton markers exist
 * - no api.line.me
 * - no requests/httpx usage
 */

const fs = require("fs");
const path = require("path");

function outputAndExit(summary, code = 0) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(code);
}

(() => {
  const adapterPath = path.resolve(__dirname, "../../backend/app/services/line_adapter.py");

  const summary = {
    phase: "Phase 5.4C LINE Adapter Skeleton Smoke",
    target_file: "backend/app/services/line_adapter.py",
    checks: {
      file_exists: "not_run",
      required_functions_present: "not_run",
      disabled_markers_present: "not_run",
      no_line_api_endpoint: "not_run",
      no_requests_usage: "not_run",
      no_httpx_usage: "not_run",
    },
    result: "fail",
    failure_code: null,
    next_action: null,
  };

  if (!fs.existsSync(adapterPath)) {
    summary.checks.file_exists = "fail";
    summary.failure_code = "ADAPTER_FILE_MISSING";
    summary.next_action = "Create backend/app/services/line_adapter.py";
    return outputAndExit(summary, 1);
  }
  summary.checks.file_exists = "pass";

  const content = fs.readFileSync(adapterPath, "utf8");

  const requiredDefs = [
    "def build_text_message_payload",
    "def is_real_line_configured",
    "def get_line_config_status",
    "def sanitize_line_error",
    "def create_disabled_line_result",
    "def push_line_message",
  ];

  const missingDefs = requiredDefs.filter((d) => !content.includes(d));
  summary.checks.required_functions_present = missingDefs.length === 0 ? "pass" : "fail";
  if (missingDefs.length > 0) {
    summary.failure_code = "REQUIRED_FUNCTIONS_MISSING";
    summary.next_action = `Missing definitions: ${missingDefs.join(", ")}`;
    return outputAndExit(summary, 1);
  }

  const markers = ["disabled_skeleton", "attempted", "real_send_enabled", "send_status"];
  const missingMarkers = markers.filter((m) => !content.includes(m));
  summary.checks.disabled_markers_present = missingMarkers.length === 0 ? "pass" : "fail";
  if (missingMarkers.length > 0) {
    summary.failure_code = "SKELETON_MARKERS_MISSING";
    summary.next_action = `Missing markers: ${missingMarkers.join(", ")}`;
    return outputAndExit(summary, 1);
  }

  summary.checks.no_line_api_endpoint = /api\.line\.me/i.test(content) ? "fail" : "pass";
  summary.checks.no_requests_usage = /\brequests\b/i.test(content) ? "fail" : "pass";
  summary.checks.no_httpx_usage = /\bhttpx\b/i.test(content) ? "fail" : "pass";

  const failedBoundary = Object.entries(summary.checks)
    .filter(([, v]) => v === "fail")
    .map(([k]) => k);

  if (failedBoundary.length > 0) {
    summary.failure_code = "BOUNDARY_VIOLATION";
    summary.next_action = `Fix boundary checks: ${failedBoundary.join(", ")}`;
    return outputAndExit(summary, 1);
  }

  summary.result = "pass";
  summary.next_action = "Adapter skeleton static checks passed with no external-send boundary violations.";
  return outputAndExit(summary, 0);
})();

