/*
 * Phase 5.5C - Customer identity abstraction static smoke
 *
 * Goals (no network calls):
 * - helper exists with required identity sources and functions
 * - no LIFF SDK import
 * - no api.line.me / LINE Messaging API usage
 * - OrderConfirm gates line_user_id via shouldSubmitLineUserId
 * - mock line_user_id is not printed in UI page
 */

const fs = require("fs");
const path = require("path");

function outputAndExit(summary, code = 0) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(code);
}

(() => {
  const helperPath = path.resolve(__dirname, "../../frontend/src/features/store/customerIdentity.ts");
  const orderConfirmPath = path.resolve(__dirname, "../../frontend/src/pages/liff/OrderConfirm.tsx");
  const liffServicePath = path.resolve(__dirname, "../../frontend/src/features/store/liffService.ts");

  const summary = {
    phase: "Phase 5.5C Customer Identity Smoke",
    targets: {
      helper: path.relative(process.cwd(), helperPath),
      order_confirm: path.relative(process.cwd(), orderConfirmPath),
      liff_service: path.relative(process.cwd(), liffServicePath),
    },
    checks: {
      helper_exists: "not_run",
      order_confirm_exists: "not_run",
      required_functions_present: "not_run",
      identity_sources_present: "not_run",
      no_liff_sdk_import: "not_run",
      no_api_line_me: "not_run",
      should_submit_guard_present: "not_run",
      no_mock_line_id_in_ui: "not_run",
    },
    result: "fail",
    failure_code: null,
    next_action: null,
  };

  if (!fs.existsSync(helperPath)) {
    summary.checks.helper_exists = "fail";
    summary.failure_code = "HELPER_MISSING";
    summary.next_action = `Create helper at ${summary.targets.helper}`;
    return outputAndExit(summary, 1);
  }
  summary.checks.helper_exists = "pass";

  if (!fs.existsSync(orderConfirmPath)) {
    summary.checks.order_confirm_exists = "fail";
    summary.failure_code = "ORDER_CONFIRM_MISSING";
    summary.next_action = `Create ${summary.targets.order_confirm}`;
    return outputAndExit(summary, 1);
  }
  summary.checks.order_confirm_exists = "pass";

  const helperContent = fs.readFileSync(helperPath, "utf8");
  const orderConfirmContent = fs.readFileSync(orderConfirmPath, "utf8");
  const liffServiceContent = fs.readFileSync(liffServicePath, "utf8");

  const requiredFunctions = [
    "maskLineUserId",
    "isLiffRuntimeAvailable",
    "getMockLiffIdentity",
    "getManualIdentityFromForm",
    "resolveIdentitySource",
    "getCustomerIdentity",
    "shouldSubmitLineUserId",
  ];
  const missingFns = requiredFunctions.filter((fn) => !helperContent.includes(fn));
  summary.checks.required_functions_present = missingFns.length === 0 ? "pass" : "fail";
  if (missingFns.length) {
    summary.failure_code = "HELPER_FUNCTIONS_MISSING";
    summary.next_action = `Missing helper functions: ${missingFns.join(", ")}`;
    return outputAndExit(summary, 1);
  }

  const sources = ["\"manual\"", "\"mock_liff\"", "\"future_liff\""];
  const missingSources = sources.filter((s) => !helperContent.includes(s));
  summary.checks.identity_sources_present = missingSources.length === 0 ? "pass" : "fail";
  if (missingSources.length) {
    summary.failure_code = "IDENTITY_SOURCES_MISSING";
    summary.next_action = `Missing identity sources: ${missingSources.join(", ")}`;
    return outputAndExit(summary, 1);
  }

  const noLiffSdk = !/[@]line\/(liff|line-sdk)/i.test(helperContent + orderConfirmContent + liffServiceContent);
  summary.checks.no_liff_sdk_import = noLiffSdk ? "pass" : "fail";
  if (!noLiffSdk) {
    summary.failure_code = "LIFF_SDK_IMPORT_FOUND";
    summary.next_action = "Remove LIFF SDK imports (should stay disabled).";
    return outputAndExit(summary, 1);
  }

  const noApiLineMe = !/api\.line\.me/i.test(helperContent + orderConfirmContent + liffServiceContent);
  summary.checks.no_api_line_me = noApiLineMe ? "pass" : "fail";
  if (!noApiLineMe) {
    summary.failure_code = "LINE_API_CALL_FOUND";
    summary.next_action = "Remove external LINE API references.";
    return outputAndExit(summary, 1);
  }

  const guardPresent = orderConfirmContent.includes("shouldSubmitLineUserId") && orderConfirmContent.includes("line_user_id");
  summary.checks.should_submit_guard_present = guardPresent ? "pass" : "fail";
  if (!guardPresent) {
    summary.failure_code = "LINE_ID_GUARD_MISSING";
    summary.next_action = "Ensure OrderConfirm gates line_user_id with shouldSubmitLineUserId.";
    return outputAndExit(summary, 1);
  }

  const noMockIdInUi = !orderConfirmContent.includes("U_mock_001");
  summary.checks.no_mock_line_id_in_ui = noMockIdInUi ? "pass" : "fail";
  if (!noMockIdInUi) {
    summary.failure_code = "MOCK_ID_LEAK";
    summary.next_action = "Remove mock line_user_id literal from UI page.";
    return outputAndExit(summary, 1);
  }

  summary.result = "pass";
  summary.next_action = "Customer identity abstraction static checks passed.";
  return outputAndExit(summary, 0);
})();
