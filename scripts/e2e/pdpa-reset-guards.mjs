#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const FRONTEND_SRC = path.join(ROOT, "frontend", "src");
const BACKEND_DIR = path.join(ROOT, "backend");
const DATABASE_DIR = path.join(ROOT, "database");

const summary = {
  result: "pending",
  timestamp: new Date().toISOString(),
  checks: {},
  failures: [],
};

function record(name, passed, detail = {}) {
  summary.checks[name] = { status: passed ? "pass" : "fail", detail };
  if (!passed) {
    summary.failures.push({ name, detail });
  }
}

function finish() {
  const ok = summary.failures.length === 0;
  summary.result = ok ? "pass" : "fail";
  console.log(JSON.stringify(summary, null, 2));
  process.exit(ok ? 0 : 1);
}

async function readFile(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function checkContains(label, filePath, needle) {
  try {
    const content = await readFile(filePath);
    const passed = content.includes(needle);
    record(label, passed, {
      file: path.relative(ROOT, filePath),
      needle,
    });
  } catch (error) {
    record(label, false, { error: error.message, file: path.relative(ROOT, filePath) });
  }
}

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".sql",
  ".py",
  ".txt",
  ".env",
  ".yml",
  ".yaml",
]);
const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".turbo"]);

async function searchDirectoryForString(rootDir, needle) {
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await walk(fullPath);
        if (found) return found;
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext && !TEXT_EXTENSIONS.has(ext)) continue;
        const content = await readFile(fullPath);
        if (content.includes(needle)) {
          return fullPath;
        }
      }
    }
    return null;
  }
  return walk(rootDir);
}

async function main() {
  await checkContains(
    "privacy_route",
    path.join(FRONTEND_SRC, "App.tsx"),
    'path="/privacy"'
  );

  await checkContains(
    "order_privacy_notice",
    path.join(FRONTEND_SRC, "pages", "liff", "CustomerMenu.tsx"),
    "การใช้ข้อมูลส่วนตัว"
  );

  await checkContains(
    "order_privacy_link",
    path.join(FRONTEND_SRC, "pages", "liff", "CustomerMenu.tsx"),
    "Link to=\"/privacy\""
  );

  await checkContains(
    "pdpa_checkbox_logic",
    path.join(FRONTEND_SRC, "pages", "liff", "OrderConfirm.tsx"),
    "pdpaAccepted"
  );

  await checkContains(
    "pdpa_validation_copy",
    path.join(FRONTEND_SRC, "pages", "liff", "OrderConfirm.tsx"),
    "โปรดยืนยันการใช้ข้อมูล"
  );

  await checkContains(
    "slip_notice_copy",
    path.join(FRONTEND_SRC, "pages", "order", "OrderStatusPage.tsx"),
    "หลักฐานการชำระเงินจะถูกใช้เพื่อการตรวจสอบยอดโอน"
  );

  await checkContains(
    "reset_flag_guard",
    path.join(FRONTEND_SRC, "services", "demoReset.ts"),
    "VITE_ALLOW_DEMO_DATA_RESET"
  );

  await checkContains(
    "namespaced_reset_logic",
    path.join(FRONTEND_SRC, "services", "demoReset.ts"),
    "key && key.startsWith(VALORA_KEY_PREFIX)"
  );

  await checkContains(
    "privacy_page_sections",
    path.join(FRONTEND_SRC, "pages", "PrivacyNotice.tsx"),
    "ข้อมูลที่เก็บ"
  );
  await checkContains(
    "privacy_page_purposes",
    path.join(FRONTEND_SRC, "pages", "PrivacyNotice.tsx"),
    "วัตถุประสงค์ในการใช้ข้อมูล"
  );
  await checkContains(
    "privacy_page_access",
    path.join(FRONTEND_SRC, "pages", "PrivacyNotice.tsx"),
    "การเข้าถึงข้อมูล"
  );
  await checkContains(
    "privacy_page_contact",
    path.join(FRONTEND_SRC, "pages", "PrivacyNotice.tsx"),
    "ช่องทางติดต่อ"
  );
  await checkContains(
    "privacy_page_scope",
    path.join(FRONTEND_SRC, "pages", "PrivacyNotice.tsx"),
    "ขอบเขตการใช้งาน"
  );

  const badLabelFrontend = await searchDirectoryForString(FRONTEND_SRC, "Reset Database");
  const badLabelBackend = await searchDirectoryForString(BACKEND_DIR, "Reset Database");
  record("no_reset_database_label", !(badLabelFrontend || badLabelBackend), {
    frontend_file: badLabelFrontend ? path.relative(ROOT, badLabelFrontend) : null,
    backend_file: badLabelBackend ? path.relative(ROOT, badLabelBackend) : null,
  });

  const backendPdpa = await searchDirectoryForString(BACKEND_DIR, "pdpa");
  const databasePdpa = await searchDirectoryForString(DATABASE_DIR, "pdpa");
  record("no_pdpa_backend_schema", !(backendPdpa || databasePdpa), {
    backend_hit: backendPdpa ? path.relative(ROOT, backendPdpa) : null,
    database_hit: databasePdpa ? path.relative(ROOT, databasePdpa) : null,
  });
}

main()
  .catch((error) => {
    record("script_error", false, { message: error.message, stack: error.stack });
  })
  .finally(() => finish());
