// Automated route and navigation snapshot runner
// Requirements: playwright installed in frontend (dev dependency)
// Usage:
//   FRONTEND_URL=https://... BACKEND_URL=https://... node scripts/e2e/route-navigation-snapshot.js
// Defaults: FRONTEND_URL=http://localhost:8080, BACKEND_URL=http://127.0.0.1:8000

const fs = require("fs/promises");
const path = require("path");
const { chromium } = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"));

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:8080").trim().replace(/\/$/, "");
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").trim().replace(/\/$/, "");

const screenshotDir = path.resolve(__dirname, "./screenshots/routes");
const reportDir = path.resolve(__dirname, "./reports/routes");
const summaryJsonPath = path.join(reportDir, "route-navigation-summary.json");
const reportMdPath = path.join(reportDir, "route-navigation-report.md");

function fullUrl(base, route) {
  return `${base}${route}`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (err) {
    // ignore parse error
  }
  return { res, text, json };
}

function detectVercel404(status, bodyText) {
  const t = (bodyText || "").toUpperCase();
  return status === 404 || t.includes("NOT_FOUND") || t.includes("DEPLOYMENT_NOT_FOUND");
}

function detectBlank(bodyText) {
  const txt = (bodyText || "").trim();
  return txt.length < 30;
}

async function runBackendChecks(productIdCandidate) {
  const endpoints = [
    { name: "health", url: `${BACKEND_URL}/health` },
    { name: "health_db", url: `${BACKEND_URL}/health/db` },
    { name: "health_auth", url: `${BACKEND_URL}/health/auth` },
    { name: "health_line_ready", url: `${BACKEND_URL}/health/line-ready` },
    { name: "customer_menu", url: `${BACKEND_URL}/api/customer/menu` },
  ];

  const results = [];
  let productId = productIdCandidate;

  for (const ep of endpoints) {
    try {
      const { res, text, json } = await fetchJson(ep.url);
      results.push({ endpoint: ep.name, status: res.status, ok: res.ok, body: json || text.slice(0, 500) });
      if (ep.name === "customer_menu" && json && Array.isArray(json.items) && json.items.length > 0) {
        const candidate = json.items.find((i) => i.id);
        if (candidate) productId = candidate.id;
        // safe field checks
        const bannedKeys = ["cost", "profit", "supplier", "service_role", "password", "line_user_id"];
        const unsafeItem = json.items.find((item) => bannedKeys.some((k) => k in item));
        results.push({
          endpoint: "customer_menu_safe_fields",
          status: unsafeItem ? "fail" : "pass",
          notes: unsafeItem ? `unsafe field present: ${Object.keys(unsafeItem).join(",")}` : "no banned fields found",
        });
      }
    } catch (err) {
      results.push({ endpoint: ep.name, status: "error", ok: false, body: String(err) });
    }
  }

  // product detail if available
  if (productId) {
    const url = `${BACKEND_URL}/api/customer/menu/${productId}`;
    try {
      const { res, text, json } = await fetchJson(url);
      results.push({ endpoint: "customer_menu_detail", status: res.status, ok: res.ok, body: json || text.slice(0, 500) });
    } catch (err) {
      results.push({ endpoint: "customer_menu_detail", status: "error", ok: false, body: String(err) });
    }
  } else {
    results.push({ endpoint: "customer_menu_detail", status: "skipped", ok: false, body: "no product id" });
  }

  // CORS preflight
  try {
    const res = await fetch(`${BACKEND_URL}/api/customer/orders`, {
      method: "OPTIONS",
      headers: {
        Origin: FRONTEND_URL,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    results.push({
      endpoint: "cors_preflight",
      status: res.status,
      ok: res.ok,
      acao: res.headers.get("access-control-allow-origin"),
      notes: res.ok ? "preflight ok" : "preflight failed",
    });
  } catch (err) {
    results.push({ endpoint: "cors_preflight", status: "error", ok: false, body: String(err) });
  }

  return { results, productId };
}

function classify(routeResult) {
  if (routeResult.status === "skipped") return "skipped";
  if (routeResult.isVercel404 || routeResult.httpStatus === 404) return "fail";
  if (routeResult.isBlank) return "warning";
  if (routeResult.consoleErrors.length > 0 || routeResult.failedRequests.length > 0) return "warning";
  if (routeResult.redirectedToLogin) return "conditional_pass";
  return "pass";
}

function summarize(results) {
  const counts = { pass: 0, warning: 0, fail: 0, skipped: 0, conditional_pass: 0 };
  for (const r of results) {
    counts[r.result] = (counts[r.result] || 0) + 1;
  }
  return counts;
}

async function captureRoute(page, route) {
  const logs = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") logs.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => logs.pageErrors.push(String(err)));
  page.on("requestfailed", (req) => logs.failedRequests.push({ url: req.url(), errorText: req.failure()?.errorText }));

  const target = fullUrl(FRONTEND_URL, route.path);
  const response = await page.goto(target, { waitUntil: "networkidle", timeout: 60000 });
  const httpStatus = response ? response.status() : null;
  const finalUrl = page.url();
  const title = await page.title();
  const bodyText = (await page.textContent("body")) || "";
  const isVercel404 = detectVercel404(httpStatus, bodyText);
  const isBlank = detectBlank(bodyText);
  const redirectedToLogin = /\/client-access/.test(finalUrl) && route.protected;

  const screenshotPath = path.join(screenshotDir, `${route.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = classify({ ...logs, isVercel404, httpStatus, isBlank, redirectedToLogin, status: "ok" });

  return {
    route: route.path,
    name: route.name,
    category: route.category,
    httpStatus,
    finalUrl,
    title,
    bodyPreview: bodyText.trim().slice(0, 280),
    isVercel404,
    isBlank,
    redirectedToLogin,
    consoleErrors: logs.consoleErrors,
    pageErrors: logs.pageErrors,
    failedRequests: logs.failedRequests,
    screenshot: screenshotPath,
    result,
  };
}

async function checkNavigationLinks() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.goto(fullUrl(FRONTEND_URL, "/"), { waitUntil: "domcontentloaded" });
  const body = (await page.textContent("body")) || "";
  const findLink = async (href) => {
    const el = await page.$(`a[href='${href}']`);
    return Boolean(el);
  };
  const hasMenu = await findLink("/liff/menu");
  const hasClientAccess = await findLink("/client-access");
  await browser.close();
  return {
    pageStatus: res ? res.status() : null,
    bodyPreview: body.trim().slice(0, 180),
    links: {
      liffMenu: hasMenu,
      clientAccess: hasClientAccess,
    },
  };
}

async function generateReports(data) {
  await fs.writeFile(summaryJsonPath, JSON.stringify(data, null, 2), "utf-8");

  const lines = [];
  lines.push(`# Production Route + Navigation Automated Test`);
  lines.push("");
  lines.push(`Timestamp: ${data.timestamp}`);
  lines.push(`FRONTEND_URL: ${data.frontendUrl}`);
  lines.push(`BACKEND_URL: ${data.backendUrl}`);
  lines.push(`Decision: ${data.decision}`);
  lines.push("");
  lines.push(`## Summary Counts`);
  lines.push("```");
  lines.push(JSON.stringify(data.counts, null, 2));
  lines.push("```");

  lines.push("\n## Frontend Routes");
  lines.push("| Route | Status | Result | Final URL | Screenshot | Notes |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const r of data.routes) {
    lines.push(
      `| ${r.route} | ${r.httpStatus ?? "-"} | ${r.result} | ${r.finalUrl} | ${path.basename(r.screenshot)} | ${r.isVercel404 ? "Vercel 404" : r.isBlank ? "blank?" : r.redirectedToLogin ? "redirected to login" : ""} |`
    );
  }

  lines.push("\n## Navigation Links (Landing)");
  lines.push("| Link | Found? | Notes |");
  lines.push("| --- | --- | --- |");
  lines.push(`| /liff/menu | ${data.navigation.links.liffMenu ? "yes" : "no"} | primary customer CTA |`);
  lines.push(`| /client-access | ${data.navigation.links.clientAccess ? "yes" : "no"} | admin/login CTA |`);

  lines.push("\n## Backend Endpoints");
  lines.push("| Endpoint | Status | OK | Notes |");
  lines.push("| --- | --- | --- | --- |");
  for (const b of data.backend) {
    lines.push(`| ${b.endpoint} | ${b.status} | ${b.ok ?? "-"} | ${b.notes || ""} |`);
  }

  lines.push("\n## CORS");
  const cors = data.backend.find((b) => b.endpoint === "cors_preflight");
  lines.push("| Origin | Status | OK | ACAO | Notes |");
  lines.push("| --- | --- | --- | --- | --- |");
  lines.push(
    `| ${data.frontendUrl} | ${cors?.status ?? "-"} | ${cors?.ok ?? "-"} | ${cors?.acao ?? ""} | ${cors?.notes ?? ""} |`
  );

  lines.push("\n## Issues");
  if (data.routes.some((r) => r.result === "fail" || r.result === "warning")) {
    for (const r of data.routes.filter((r) => r.result === "fail" || r.result === "warning")) {
      lines.push(`- [${r.result}] ${r.route} → ${r.finalUrl} (${r.isVercel404 ? "Vercel 404" : r.isBlank ? "blank" : ""})`);
      if (r.consoleErrors.length) lines.push(`  - console errors: ${r.consoleErrors.slice(0, 2).join(" | ")}`);
      if (r.failedRequests.length) lines.push(`  - failed requests: ${r.failedRequests.slice(0, 2).map((f) => f.url).join(" | ")}`);
    }
  } else {
    lines.push("- None");
  }

  await fs.writeFile(reportMdPath, lines.join("\n"), "utf-8");
}

async function main() {
  await ensureDir(screenshotDir);
  await ensureDir(reportDir);

  // preload product id from backend menu
  let productId = null;
  try {
    const { res, json } = await fetchJson(`${BACKEND_URL}/api/customer/menu`);
    if (res.ok && json && Array.isArray(json.items) && json.items.length > 0) {
      const candidate = json.items.find((i) => i.id);
      if (candidate) productId = candidate.id;
    }
  } catch (err) {
    // ignore
  }

  const routes = [
    { name: "01-landing", path: "/", category: "public" },
    { name: "02-client-access", path: "/client-access", category: "public" },
    { name: "10-liff-menu", path: "/liff/menu", category: "customer" },
    { name: "12-liff-cart", path: "/liff/cart", category: "customer" },
    { name: "13-liff-confirm", path: "/liff/confirm", category: "customer" },
    { name: "14-liff-success", path: "/liff/success", category: "customer" },
    { name: "20-app-dashboard", path: "/app/dashboard", category: "protected", protected: true },
    { name: "21-app-scenario", path: "/app/scenario", category: "protected", protected: true },
    { name: "22-app-promo", path: "/app/promo", category: "protected", protected: true },
    { name: "23-app-delivery", path: "/app/delivery", category: "protected", protected: true },
    { name: "24-app-reports", path: "/app/reports", category: "protected", protected: true },
    { name: "25-app-menu", path: "/app/menu", category: "protected", protected: true },
    { name: "26-app-orders", path: "/app/orders", category: "protected", protected: true },
    { name: "27-app-settings", path: "/app/settings", category: "protected", protected: true },
    { name: "30-store-admin", path: "/store-admin", category: "store-admin", protected: true },
    { name: "31-store-admin-menus", path: "/store-admin/menus", category: "store-admin", protected: true },
    { name: "32-store-admin-orders", path: "/store-admin/orders", category: "store-admin", protected: true },
    { name: "33-store-admin-customers", path: "/store-admin/customers", category: "store-admin", protected: true },
    { name: "34-store-admin-reports", path: "/store-admin/reports", category: "store-admin", protected: true },
    { name: "40-system", path: "/system", category: "system", protected: true },
    { name: "41-system-health", path: "/system/health", category: "system", protected: true },
    // legacy admin routes (should redirect/guard)
    { name: "90-admin", path: "/admin", category: "legacy", protected: true },
    { name: "91-admin-orders", path: "/admin/orders", category: "legacy", protected: true },
    { name: "92-admin-products", path: "/admin/products", category: "legacy", protected: true },
    { name: "93-admin-store", path: "/admin/store", category: "legacy", protected: true },
    { name: "94-admin-sales-channels", path: "/admin/sales-channels", category: "legacy", protected: true },
  ];

  if (productId) {
    routes.splice(3, 0, { name: "11-liff-product-detail", path: `/liff/menu/${productId}`, category: "customer" });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const routeResults = [];
  for (const route of routes) {
    const page = await context.newPage();
    try {
      const res = await captureRoute(page, route);
      routeResults.push(res);
    } catch (err) {
      routeResults.push({
        route: route.path,
        name: route.name,
        category: route.category,
        result: "fail",
        error: String(err),
        screenshot: path.join(screenshotDir, `${route.name}.png`),
        httpStatus: null,
        finalUrl: null,
        consoleErrors: [String(err)],
        pageErrors: [],
        failedRequests: [],
        isVercel404: false,
        isBlank: false,
        redirectedToLogin: false,
      });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  const navigationLinks = await checkNavigationLinks();
  const backendChecks = await runBackendChecks(productId);
  const counts = summarize(routeResults);
  const decision = routeResults.some((r) => r.result === "fail") ? "fail" : "conditional_pass";

  const summary = {
    timestamp: new Date().toISOString(),
    frontendUrl: FRONTEND_URL,
    backendUrl: BACKEND_URL,
    counts,
    routes: routeResults,
    navigation: navigationLinks,
    backend: backendChecks.results,
    productId: backendChecks.productId,
    decision,
  };

  await generateReports(summary);
  console.log(JSON.stringify({ message: "route navigation snapshot complete", summaryJsonPath, reportMdPath, counts, decision }, null, 2));
}

main().catch((err) => {
  console.error("route navigation snapshot failed", err);
  process.exitCode = 1;
});
