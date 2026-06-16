#!/usr/bin/env node
import process from "node:process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ENV,
  maskedEnvSummary,
  ensureEnvVars,
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

async function main() {
  summary.env = maskedEnvSummary();
  try {
    assertLocalFirstUnlessCloud("owner-dashboard-freshness-smoke");
  } catch (error) {
    recordFailure("local_policy", error.message, error.details || {});
    finish(false, "Local-first policy violated");
    return;
  }

  try {
    ensureEnvVars(["backendUrl", "frontendUrl", "ownerToken", "staffToken"]);
  } catch (error) {
    recordFailure("missing_env", error.message, error.summary || {});
    finish(false, "Missing required env values for smoke test");
    return;
  }

  await ownerDashboardApiCheck();
  await staffRestrictionChecks();
  inspectDashboardSource();
  inspectPaymentReviewCopy();
  inspectAppRouting();

  const ok = summary.failures.length === 0;
  finish(ok, ok ? "owner dashboard freshness smoke passed" : "owner dashboard freshness smoke failed");
}

async function ownerDashboardApiCheck() {
  try {
    const resp = await fetchJson(`${ENV.backendUrl}/api/store-admin/dashboard-summary`, {
      headers: auth(ENV.ownerToken),
    });
    if (!resp.ok) {
      recordFailure("owner_dashboard_api", "Owner dashboard summary request failed", resp);
      return;
    }
    recordCheck("owner_dashboard_api", "ok", { store_id_present: Boolean(resp.body?.store_id) });
  } catch (error) {
    recordFailure("owner_dashboard_api", error.message);
  }
}

async function staffRestrictionChecks() {
  const endpoints = [
    { name: "dashboard-summary", path: "/api/store-admin/dashboard-summary" },
    { name: "reports-sales", path: "/api/store-admin/reports/sales" },
  ];

  for (const { name, path } of endpoints) {
    try {
      const resp = await fetchJson(`${ENV.backendUrl}${path}`, { headers: auth(ENV.staffToken) });
      if (resp.ok) {
        recordFailure("staff_access", `Staff was able to access restricted endpoint ${name}`, {
          endpoint: path,
          status: resp.status,
        });
      } else {
        recordCheck(`staff_denied_${name}`, "ok", { status: resp.status });
      }
    } catch (error) {
      recordFailure("staff_access", error.message, { endpoint: path });
    }
  }
}

function inspectDashboardSource() {
  try {
    const file = readFileSync(resolve("frontend", "src", "pages", "Dashboard.tsx"), "utf8");
    assertIncludes(file, "ข้อมูลอัปเดตล่าสุด", "freshness indicator text missing");
    assertIncludes(file, "รีเฟรชข้อมูล", "refresh button label missing");
    assertIncludes(file, "to=\"/app/planning\"", "Profit Planning CTA link missing");
    assertIncludes(file, "วางแผนกำไรของร้าน", "Profit Planning title missing");
    assertIncludes(file, "ดูต้นทุนต่อเมนู ราคาขาย และกำไรต่อแก้ว", "Profit Planning description missing");
    assertIncludes(file, "ดูว่าแต่ละเมนูเหลือกำไรกี่บาท", "Profit Planning bullet missing");
    assertIncludes(file, "ตรวจต้นทุนวัตถุดิบและบรรจุภัณฑ์ต่อแก้ว", "Profit Planning bullet missing");
    assertIncludes(file, "ทดลองปรับราคาเพื่อดูผลต่อกำไร", "Profit Planning bullet missing");
    assertIncludes(file, "ใช้ประกอบการตัดสินใจก่อนขายจริง", "Profit Planning bullet missing");
    assertIncludes(file, "คำนวณกำไรต่อเมนู", "Profit Planning CTA copy missing");
    assertNotIncludes(file, "งานปฏิบัติการประจำวัน", "Operational card should be removed from Owner dashboard");
    assertNotIncludes(file, "เปิด Store Admin", "Operational CTA should not appear on Owner dashboard");
    assertNotIncludes(file, "store_id", "store_id should not be rendered in dashboard primary UI");
    recordCheck("dashboard_source", "ok");
  } catch (error) {
    recordFailure("dashboard_source", error.message);
  }
}

function inspectPaymentReviewCopy() {
  try {
    const adminDetail = readFileSync(resolve("frontend", "src", "pages", "admin", "AdminOrderDetail.tsx"), "utf8");
    const slipModal = readFileSync(resolve("frontend", "src", "components", "admin", "PaymentSlipPreviewModal.tsx"), "utf8");
    assertNotIncludes(adminDetail, "ยอดที่ลูกค้าโอน", "Admin order detail should not label slip amount as verified");
    assertNotIncludes(slipModal, "ยอดที่ลูกค้าโอน", "Slip preview should not label slip amount as verified");
    assertIncludes(adminDetail, "ยอดที่ลูกค้าแจ้ง (จากสลิป)", "Admin order detail should show safer slip wording");
    assertIncludes(slipModal, "ยอดที่ลูกค้าแจ้ง (จากสลิป)", "Slip preview should show safer slip wording");
    assertIncludes(adminDetail, "โปรดตรวจสอบยอดเงิน วันที่ เวลา และบัญชีผู้รับเงินจากสลิปก่อนอนุมัติ", "Admin order detail should show slip warning");
    assertIncludes(slipModal, "โปรดตรวจสอบยอดเงิน วันที่ เวลา และบัญชีผู้รับเงินจากสลิปก่อนอนุมัติ", "Slip preview should show slip warning");
    recordCheck("payment_review_copy", "ok");
  } catch (error) {
    recordFailure("payment_review_copy", error.message);
  }
}

function inspectAppRouting() {
  try {
    const file = readFileSync(resolve("frontend", "src", "App.tsx"), "utf8");
    assertIncludes(file, '<Navigate to="/login"', "ProtectedRoute must redirect to /login on logout");
    recordCheck("app_routing", "ok");
  } catch (error) {
    recordFailure("app_routing", error.message);
  }
}

function assertIncludes(content, needle, message) {
  if (!content.includes(needle)) {
    throw new Error(message);
  }
}

function assertNotIncludes(content, needle, message) {
  if (content.includes(needle)) {
    throw new Error(message);
  }
}

await main();
