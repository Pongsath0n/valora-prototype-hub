#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..", "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

const failures = [];
function assertCondition(condition, message, detail = {}) {
  if (!condition) {
    failures.push({ message, detail });
  }
}

// ── Check A: Staff navigation visibility ─────────────────────────────────────
const adminLayout = read("frontend/src/components/admin/AdminLayout.tsx");
const adminDashboard = read("frontend/src/pages/admin/AdminDashboard.tsx");
const customersPage = read("frontend/src/pages/store-admin/CustomersPage.tsx");

assertCondition(
  /featureFlags\.showE2EHints/.test(adminDashboard),
  "Store Admin dashboard E2E banner must be gated by feature flag",
  {},
);

assertCondition(
  /featureFlags\.enableManualLineBinding/.test(customersPage),
  "Manual LINE binding UI must be gated by testing flag",
  {},
);

assertCondition(
  /Testing only: manual LINE User ID binding/.test(customersPage),
  "Manual LINE binding dialog must be labelled testing-only",
  {},
);
const navItemRegex = /\{\s*title:\s*"([^"]+)"[\s\S]*?path:\s*"([^"]+)"[\s\S]*?\}/g;
const staffForbiddenKeywords = [
  "ingredients",
  "recipes",
  "cost",
  "profit",
  "margin",
  "system",
  "health",
  "storage",
  "reset demo",
  "reset database",
  "user management",
  "role management",
];

for (const match of adminLayout.matchAll(navItemRegex)) {
  const [block, title, itemPath] = match;
  if (!/roles\s*:/.test(block)) {
    const lowerTitle = title.toLowerCase();
    const lowerPath = itemPath.toLowerCase();
    for (const keyword of staffForbiddenKeywords) {
      const condensed = keyword.replace(/\s+/g, "");
      if (lowerTitle.includes(keyword) || lowerPath.includes(condensed)) {
        assertCondition(false, "Forbidden staff navigation item detected", { title, path: itemPath, keyword });
      }
    }
  }
}

// ── Check B: Route guards ───────────────────────────────────────────────────
const appRoutes = read("frontend/src/App.tsx");
const managerRoutes = [
  "/store-admin/menus",
  "/store-admin/ingredients",
  "/store-admin/recipes",
  "/store-admin/channels",
  "/store-admin/channel-pricing",
  "/store-admin/reports",
];
managerRoutes.forEach((route) => {
  assertCondition(
    appRoutes.includes(`path=\"${route}\" element={<ManagerRoute>`),
    "ManagerRoute missing on sensitive store-admin route",
    { route },
  );
});

const businessRoutes = [
  "/app/dashboard",
  "/app/scenario",
  "/app/promo",
  "/app/delivery",
  "/app/reports",
  "/app/menu",
  "/app/ingredients",
  "/app/recipes",
  "/app/channels",
  "/app/channel-pricing",
  "/app/pos",
  "/app/orders",
  "/app/orders/:id",
  "/app/settings",
];

businessRoutes.forEach((route) => {
  assertCondition(
    appRoutes.includes(`path=\"${route}\" element={<ProtectedRoute><BusinessRoute>`),
    "BusinessRoute missing on business portal route",
    { route },
  );
});

// ── Check C: Formatter coverage ─────────────────────────────────────────────
const formatFile = read("frontend/src/lib/format.ts");
const requiredOrderStatuses = [
  "pending_payment",
  "payment_uploaded",
  "paid",
  "rejected",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];
requiredOrderStatuses.forEach((status) => {
  assertCondition(new RegExp(`${status}\\s*:`).test(formatFile), "Order status missing from formatter", { status });
});

const requiredPaymentStatuses = [
  "pending_payment",
  "pending_review",
  "payment_uploaded",
  "paid",
  "rejected",
];
requiredPaymentStatuses.forEach((status) => {
  assertCondition(new RegExp(`${status}\\s*:`).test(formatFile), "Payment status missing from formatter", { status });
});

// ── Check D: UI files using format helpers ───────────────────────────────────
const filesRequiringFormatter = [
  "frontend/src/pages/admin/AdminOrders.tsx",
  "frontend/src/pages/admin/AdminOrderDetail.tsx",
  "frontend/src/pages/Orders.tsx",
  "frontend/src/pages/OrderDetail.tsx",
];
filesRequiringFormatter.forEach((relativePath) => {
  const content = read(relativePath);
  assertCondition(/format(Order|Payment)Status/.test(content), "Formatter helpers missing in file", { relativePath });
});

// ── Check E: Reset Demo/Data strings ────────────────────────────────────────
function findOccurrences(dir, keyword, results = []) {
  const skipNames = new Set(["node_modules", ".git", "dist", "build", ".next", ".turbo"]);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipNames.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findOccurrences(fullPath, keyword, results);
    } else if (/\.(tsx?|jsx?|mjs|cjs|json|md|txt)$/i.test(entry.name)) {
      const data = readFileSync(fullPath, "utf-8");
      if (data.includes(keyword)) {
        results.push(fullPath.replace(repoRoot + path.sep, ""));
      }
    }
  }
  return results;
}

const resetDemoMatches = findOccurrences(path.join(repoRoot, "frontend", "src"), "Reset Demo Data");
resetDemoMatches.forEach((filePath) => {
  const lower = filePath.toLowerCase();
  assertCondition(
    lower.includes("system") || lower.includes("demoreset"),
    "Reset Demo Data string should stay in owner/testing contexts",
    { filePath },
  );
});

const resetDbMatches = findOccurrences(path.join(repoRoot, "frontend", "src"), "Reset Database");
assertCondition(resetDbMatches.length === 0, "Forbidden string 'Reset Database' detected", { matches: resetDbMatches });

// ── Check F: Formatter usage still enforced on staff routes ──────────────────
const staffRoutes = ["/store-admin/orders", "/store-admin/pos", "/store-admin/customers"];
staffRoutes.forEach((routePath) => {
  assertCondition(
    appRoutes.includes(`path=\"${routePath}\" element={<AdminRoute>`),
    "Staff route missing AdminRoute guard",
    { routePath },
  );
});

if (failures.length) {
  console.error("navigation-labels audit failed", JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      result: "pass",
      checks: {
        staff_nav: "ok",
        route_guards: "ok",
        formatters: "ok",
        ui_usage: "ok",
        reset_strings: "ok",
      },
    },
    null,
    2,
  ),
);
