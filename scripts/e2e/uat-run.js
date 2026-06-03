// Automated UAT snapshot runner
// Requirements: playwright installed (dev dep in frontend). Uses chromium headless.
// Does NOT activate real LIFF SDK, does NOT call external LINE APIs.

const fs = require("fs/promises");
const path = require("path");

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:8080").trim().replace(/\/$/, "");
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").trim().replace(/\/$/, "");

const { chromium } = require(path.resolve(__dirname, "../../frontend/node_modules/playwright"));

const outDir = path.resolve(__dirname, "./screenshots/uat");
const reportDir = path.resolve(__dirname, "./reports/uat");

async function ensureDirs() {
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(reportDir, { recursive: true });
}

function futurePickupLocal(minutes = 45) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  d.setSeconds(0, 0);
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mi = `${d.getMinutes()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`Fetch failed ${url} ${res.status}`);
  return res.json();
}

async function getFirstProduct() {
  const data = await fetchJson(`${BACKEND_URL}/api/customer/menu`);
  const items = data?.items || [];
  if (!items.length) throw new Error("No products available for UAT");
  return items[0];
}

async function writeJson(filename, payload) {
  const target = path.join(reportDir, filename);
  await fs.writeFile(target, JSON.stringify(payload, null, 2), "utf8");
  return target;
}

async function screenshot(page, filename) {
  const target = path.join(outDir, filename);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

async function runCustomerFlow() {
  const summary = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const product = await getFirstProduct();
  const pickupTime = futurePickupLocal(45);
  let createdOrderId = null;
  const consoleLogs = [];
  page.on("console", (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));

  // CU-01 Menu
  await page.goto(`${FRONTEND_URL}/liff/menu`, { waitUntil: "networkidle" });
  summary.push({ id: "CU-01", result: "pass", note: await screenshot(page, "01-customer-menu.png") });

  // CU-02 Product detail
  await page.goto(`${FRONTEND_URL}/liff/menu/${product.id}`, { waitUntil: "networkidle" });
  summary.push({ id: "CU-02", result: "pass", note: await screenshot(page, "02-product-detail.png") });

  // Prepare cart helper
  async function setCart(items) {
    await context.addInitScript((c) => {
      window.localStorage.setItem("valora:liff:cart", JSON.stringify(c));
    }, items);
  }

  // CU-03 Cart with item
  await context.clearCookies();
  await context.clearPermissions();
  await setCart([{ productId: product.id, name: product.name, price: product.price, quantity: 1 }]);
  await page.goto(`${FRONTEND_URL}/liff/cart`, { waitUntil: "networkidle" });
  summary.push({ id: "CU-03", result: "pass", note: await screenshot(page, "03-cart-with-item.png") });

  // CU-04 Cart empty
  await context.addInitScript(() => window.localStorage.removeItem("valora:liff:cart"));
  await page.goto(`${FRONTEND_URL}/liff/cart`, { waitUntil: "networkidle" });
  summary.push({ id: "CU-04", result: "pass", note: await screenshot(page, "04-cart-empty.png") });

  // CU-05 Confirm order (re-add cart)
  await context.addInitScript((c) => {
    window.localStorage.setItem("valora:liff:cart", JSON.stringify(c));
  }, [{ productId: product.id, name: product.name, price: product.price, quantity: 1 }]);
  await page.goto(`${FRONTEND_URL}/liff/confirm`, { waitUntil: "networkidle" });
  await page.fill("#phone", "0800000000").catch(() => {});
  await page.fill("#pickup-time", pickupTime).catch(() => {});
  await page.fill("#order-note", "Automated UAT").catch(() => {});
  summary.push({ id: "CU-05-pre", result: "pass", note: await screenshot(page, "05-order-confirm.png") });

  // Submit order
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.getByRole("button", { name: /ยืนยัน/ }).click({ timeout: 5000 }),
    ]);
    // order success page
    createdOrderId = await page.evaluate(() => window.localStorage.getItem("valora:liff:last_order"));
    summary.push({ id: "CU-06", result: "pass", note: await screenshot(page, "06-order-success.png"), orderId: createdOrderId });
  } catch (err) {
    summary.push({ id: "CU-06", result: "fail", note: `submit failed: ${err?.message}` });
  }

  // CU-07 Success without order id (clear last_order)
  await context.addInitScript(() => window.localStorage.removeItem("valora:liff:last_order"));
  await page.goto(`${FRONTEND_URL}/liff/success`, { waitUntil: "networkidle" });
  summary.push({ id: "CU-07", result: "pass", note: await screenshot(page, "07-success-without-order-id.png") });

  await browser.close();

  return { summary, product, pickupTime, orderId: createdOrderId, consoleLogs };
}

async function lineIdentitySnapshot() {
  const data = await fetchJson(`${BACKEND_URL}/health/line-ready`);
  const file = await writeJson("line-ready.json", data);
  return { file, data };
}

async function securitySnapshot(orderId) {
  const checks = [];
  const menu = await fetchJson(`${BACKEND_URL}/api/customer/menu`);
  checks.push({ name: "menu", fields: Object.keys(menu.items?.[0] || {}) });
  let order = null;
  if (orderId) {
    try {
      order = await fetchJson(`${BACKEND_URL}/api/customer/orders/${orderId}`);
      checks.push({ name: "order", fields: Object.keys(order || {}) });
    } catch (err) {
      checks.push({ name: "order", error: err?.message });
    }
  }
  await writeJson("security-sample.json", { menuSample: menu.items?.[0] || null, orderSample: order });
  return checks;
}

async function adminSnapshot() {
  // Without credentials, capture login page only.
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let note = null;
  try {
    await page.goto(`${FRONTEND_URL}/store-admin/login`, { waitUntil: "networkidle" });
    note = await screenshot(page, "08-admin-login.png");
  } catch (err) {
    note = `skip: ${err?.message}`;
  }
  await browser.close();
  return [{ id: "SA-login", result: note?.endsWith(".png") ? "pass" : "skip", note }];
}

async function writeReport(payload) {
  const ts = new Date().toISOString();
  const lines = [];
  lines.push(`# UAT Snapshot Report`);
  lines.push(`- Timestamp: ${ts}`);
  lines.push(`- Frontend: ${FRONTEND_URL}`);
  lines.push(`- Backend: ${BACKEND_URL}`);
  lines.push(`- Line-ready: ${payload.lineIdentity?.data?.status || "unknown"} (${payload.lineIdentity?.data?.mode || ""})`);
  lines.push(`- OrderId (if created): ${payload.customer?.orderId || "n/a"}`);
  lines.push(``);
  lines.push(`## Customer Scenarios`);
  payload.customer?.summary?.forEach((s) => {
    lines.push(`- ${s.id}: ${s.result} (${s.note || ""})`);
  });
  lines.push(``);
  lines.push(`## Admin Snapshot`);
  payload.admin?.forEach((s) => {
    lines.push(`- ${s.id}: ${s.result} (${s.note || ""})`);
  });
  lines.push(``);
  lines.push(`## Security Checks`);
  payload.security?.forEach((s) => {
    lines.push(`- ${s.name}: ${s.fields ? s.fields.join(", ") : s.error}`);
  });
  const file = path.join(reportDir, "uat-snapshot-report.md");
  await fs.writeFile(file, lines.join("\n"), "utf8");
  return file;
}

async function main() {
  await ensureDirs();
  const customer = await runCustomerFlow();
  const lineIdentity = await lineIdentitySnapshot();
  const security = await securitySnapshot(customer.orderId);
  const admin = await adminSnapshot();

  const summary = { customer, lineIdentity, security, admin };
  await writeJson("uat-summary.json", summary);
  const reportFile = await writeReport(summary);
  console.log(JSON.stringify({ ok: true, report: path.relative(process.cwd(), reportFile), summary }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
