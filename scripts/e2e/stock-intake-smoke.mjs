#!/usr/bin/env node
import process from "node:process";
import { randomUUID } from "node:crypto";
import {
  ENV,
  maskedEnvSummary,
  assertLocalFirstUnlessCloud,
  ensureEnvVars,
} from "./env.mjs";

const {
  backendUrl: BACKEND_URL,
  adminToken: ADMIN_TOKEN,
  staffToken: STAFF_TOKEN,
  storeId: STORE_ID,
  productId: PRODUCT_ID,
} = ENV;

const summary = {
  result: "pending",
  env: maskedEnvSummary(),
  steps: [],
};

function record(step, detail) {
  summary.steps.push({ step, ...detail });
}

function finish(ok, message) {
  summary.result = ok ? "pass" : "fail";
  if (message) summary.message = message;
  console.log(JSON.stringify(summary, null, 2));
  process.exit(ok ? 0 : 1);
}

function fail(step, message, detail) {
  record(step, { ok: false, message, detail });
  finish(false, message);
}

function assertCondition(condition, step, message, detail) {
  if (!condition) {
    fail(step, message, detail);
  }
}

function withStoreId(path) {
  if (!STORE_ID) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}store_id=${encodeURIComponent(STORE_ID)}`;
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
  } catch (error) {
    return { ok: false, status: null, body: { error: error.message } };
  }
}

async function adminRequest(method, path, body) {
  const headers = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  let requestBody = body;
  if (body !== undefined) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    requestBody = JSON.stringify(body);
  }
  return fetchJson(`${BACKEND_URL}${path}`, { method, headers, body: requestBody });
}

async function staffRequest(method, path, body) {
  const headers = { Authorization: `Bearer ${STAFF_TOKEN}` };
  let requestBody = body;
  if (body !== undefined) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    requestBody = JSON.stringify(body);
  }
  return fetchJson(`${BACKEND_URL}${path}`, { method, headers, body: requestBody });
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function approxEqual(a, b, tolerance = 0.0001) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function randomPhone() {
  return `098${Math.floor(1000000 + Math.random() * 9000000)}`;
}

async function main() {
  try {
    assertLocalFirstUnlessCloud("Stock Intake Smoke");
    ensureEnvVars(["backendUrl", "adminToken", "staffToken", "storeId", "productId"]);
  } catch (error) {
    fail(
      error.code === "LOCAL_FIRST_VIOLATION" ? "local_first_violation" : "missing_env",
      error.message,
      error.details || error.summary || error.missing || {}
    );
  }

  if (!STAFF_TOKEN) {
    fail("staff_token_missing", "STAFF_TOKEN is required for permission checks", {});
  }

  const ingredientResp = await adminRequest("GET", withStoreId("/api/store-admin/ingredients"));
  if (!ingredientResp.ok) {
    fail("ingredient_list_failed", "ไม่สามารถดึงรายการวัตถุดิบได้", ingredientResp.body);
  }
  const ingredients = Array.isArray(ingredientResp.body?.items) ? ingredientResp.body.items : [];
  assertCondition(ingredients.length > 0, "ingredient_precheck", "no_ingredients_available", ingredientResp.body);
  const targetIngredient = ingredients.find((row) => row.is_active ?? true) ?? ingredients[0];

  const baselineStock = safeNumber(targetIngredient.current_stock);
  const baselineCost = safeNumber(targetIngredient.cost_per_unit);
  const baselineLastPurchase = targetIngredient.last_purchase_at || null;

  const batchRef = randomUUID().slice(0, 8);
  const quantity = Number((2 + Math.random()).toFixed(4));
  const conversionFactor = 5;
  const normalizedQuantity = Number((quantity * conversionFactor).toFixed(4));
  const totalCost = Number(((baselineCost || 5) * normalizedQuantity + 25).toFixed(2));
  const supplierName = targetIngredient.supplier_name || `Auto Supplier ${batchRef}`;
  const note = `Stock intake smoke ${batchRef}`;
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const intakePayload = {
    ingredient_id: targetIngredient.id,
    quantity,
    purchase_unit: targetIngredient.unit || "unit",
    conversion_factor: conversionFactor,
    total_cost: totalCost,
    supplier_name: supplierName,
    payment_status: "unpaid",
    due_date: dueDate,
    note,
  };

  const createResp = await adminRequest("POST", withStoreId("/api/store-admin/stock-intakes"), intakePayload);
  if (!createResp.ok) {
    fail("create_stock_intake_failed", "สร้างข้อมูลสต็อกไม่สำเร็จ", createResp.body);
  }
  const intake = createResp.body?.intake;
  const ingredientAfter = createResp.body?.ingredient;
  assertCondition(Boolean(intake?.id && ingredientAfter), "create_stock_intake_response", "missing_intake_payload", createResp.body);
  record("create_stock_intake", { ok: true, intake_id: intake.id, movement_id: intake.movement_id });

  const expectedStock = baselineStock + normalizedQuantity;
  const purchaseUnitCost = totalCost / normalizedQuantity;
  const expectedCost = baselineStock <= 0 ? purchaseUnitCost : ((baselineStock * baselineCost) + totalCost) / (baselineStock + normalizedQuantity);

  assertCondition(approxEqual(intake.normalized_quantity, normalizedQuantity), "normalized_quantity_check", "normalized_quantity_mismatch", { expected: normalizedQuantity, actual: intake.normalized_quantity });
  assertCondition(intake.payment_status === "unpaid", "payment_status_check", "payment_status_should_be_unpaid", intake);
  assertCondition(intake.movement_type === "in" && intake.movement_id, "movement_record_check", "movement_metadata_missing", intake);

  assertCondition(
    approxEqual(safeNumber(ingredientAfter.current_stock), expectedStock, 0.0001),
    "stock_recalculation",
    "current_stock_not_updated",
    { expected: expectedStock, actual: ingredientAfter.current_stock }
  );
  assertCondition(
    approxEqual(safeNumber(ingredientAfter.cost_per_unit), expectedCost, 0.0001),
    "moving_average",
    "cost_per_unit_not_updated",
    { expected: expectedCost, actual: ingredientAfter.cost_per_unit }
  );
  assertCondition(ingredientAfter.cost_source === "purchase_derived", "cost_source_update", "cost_source_not_purchase", ingredientAfter);
  assertCondition(
    ingredientAfter.last_purchase_at && ingredientAfter.last_purchase_at !== baselineLastPurchase,
    "last_purchase_timestamp",
    "last_purchase_not_updated",
    { before: baselineLastPurchase, after: ingredientAfter.last_purchase_at }
  );

  const intakeDetail = await adminRequest("GET", withStoreId(`/api/store-admin/stock-intakes/${intake.id}`));
  if (!intakeDetail.ok) {
    fail("stock_intake_lookup_failed", "ดึงรายละเอียด Stock Intake ไม่สำเร็จ", intakeDetail.body);
  }
  record("stock_intake_lookup", { ok: true, intake_id: intakeDetail.body?.intake?.id });

  const intakeList = await adminRequest("GET", withStoreId(`/api/store-admin/stock-intakes?ingredient_id=${encodeURIComponent(targetIngredient.id)}&limit=10`));
  if (!intakeList.ok) {
    fail("stock_intake_list_failed", "ดึงประวัติ Stock Intake ไม่สำเร็จ", intakeList.body);
  }
  const intakeFound = Array.isArray(intakeList.body?.items) && intakeList.body.items.some((row) => row.id === intake.id);
  assertCondition(intakeFound, "stock_intake_history", "intake_not_in_list", intakeList.body);

  const staffListResp = await staffRequest("GET", withStoreId("/api/store-admin/stock-intakes"));
  assertCondition(staffListResp.status === 403, "staff_guard_list", "staff_should_be_blocked_from_list", { status: staffListResp.status, body: staffListResp.body });
  const staffCreateResp = await staffRequest("POST", withStoreId("/api/store-admin/stock-intakes"), intakePayload);
  assertCondition(staffCreateResp.status === 403, "staff_guard_create", "staff_should_be_blocked_from_create", { status: staffCreateResp.status, body: staffCreateResp.body });

  const orderPayload = {
    customer: {
      name: `INTAKE QA ${batchRef}`,
      phone: randomPhone(),
    },
    items: [
      {
        product_id: PRODUCT_ID,
        quantity: 1,
      },
    ],
    pickup_time: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    store_id: STORE_ID || undefined,
    note: `Smoke order ${batchRef}`,
  };
  const orderResp = await fetchJson(`${BACKEND_URL}/api/customer/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderPayload),
  });
  if (!orderResp.ok) {
    fail("customer_flow_regression", "customer order creation failed", orderResp.body);
  }
  record("customer_order_smoke", { ok: true, order_id: orderResp.body.order_id || orderResp.body.orderId });

  record("summary", {
    ok: true,
    ingredient_id: targetIngredient.id,
    intake_id: intake.id,
    normalized_quantity: normalizedQuantity,
    expected_stock: expectedStock,
  });

  finish(true);
}

main().catch((error) => {
  fail("script_error", error.message, { stack: error.stack });
});
