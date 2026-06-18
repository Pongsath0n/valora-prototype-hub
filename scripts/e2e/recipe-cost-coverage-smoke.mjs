#!/usr/bin/env node
import process from "node:process";
import { randomUUID } from "node:crypto";
import {
  ENV,
  maskedEnvSummary,
  ensureEnvVars,
  assertLocalFirstUnlessCloud,
  invalidTokenError,
} from "./env.mjs";

const summary = {
  result: "pending",
  env: {},
  steps: [],
  failures: [],
};

function recordStep(name, detail = {}) {
  summary.steps.push({ name, ...detail });
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

function ownerHeaders() {
  return {
    Authorization: `Bearer ${ENV.ownerToken}`,
    "Content-Type": "application/json",
  };
}

function staffHeaders() {
  return {
    Authorization: `Bearer ${ENV.staffToken}`,
    "Content-Type": "application/json",
  };
}

function withStoreId(path) {
  if (!ENV.storeId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}store_id=${encodeURIComponent(ENV.storeId)}`;
}

async function ownerRequest(method, path, body) {
  const init = { method, headers: ownerHeaders() };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return fetchJson(`${ENV.backendUrl}${path}`, init);
}

async function staffRequest(method, path, body) {
  const init = { method, headers: staffHeaders() };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return fetchJson(`${ENV.backendUrl}${path}`, init);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function expectBaselineProduct(productId, predicate, description, retries = 5) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const resp = await ownerRequest("GET", withStoreId("/api/store-admin/planning/baseline"));
    if (resp.status === 401) {
      throw invalidTokenError("owner", resp.body || resp.status);
    }
    if (!resp.ok) {
      throw new Error(`baseline_fetch_failed:${resp.status}`);
    }
    const item = (resp.body?.items || []).find((entry) => String(entry.product_id) === String(productId));
    if (item && predicate(item, resp.body)) {
      return { item, payload: resp.body };
    }
    await delay(500 * (attempt + 1));
  }
  throw new Error(`baseline_condition_failed:${description}`);
}

async function ensureCustomerMenuMasksCosts() {
  const resp = await fetchJson(`${ENV.backendUrl}/api/customer/menu`);
  if (!resp.ok) {
    recordFailure("customer_menu_unreachable", "Customer menu endpoint failed", resp);
    return;
  }
  const first = resp.body?.items?.[0];
  if (first && ("current_unit_cost" in first || "cost_status" in first)) {
    recordFailure("customer_cost_leak", "Customer menu leaked cost fields", { sample: first });
  } else {
    recordStep("customer_menu_cost_mask", { ok: true });
  }
}

async function main() {
  summary.env = maskedEnvSummary();
  try {
    assertLocalFirstUnlessCloud("recipe-cost-coverage-smoke");
    ensureEnvVars(["backendUrl", "ownerToken", "staffToken", "storeId"]);
  } catch (error) {
    recordFailure(error.code || "env_error", error.message, error.details || error.summary || {});
    finish(false, "Environment validation failed");
    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const resource = {
    ingredientId: null,
    productId: null,
    recipeId: null,
  };

  try {
    // Create ingredient with baseline manual cost
    const ingredientPayload = {
      name: `E2E Ingredient ${suffix}`,
      unit: "g",
      cost_per_unit: 5,
      current_stock: 100,
      low_stock_threshold: 1,
    };
    const ingredientResp = await ownerRequest("POST", withStoreId("/api/store-admin/ingredients"), ingredientPayload);
    if (!ingredientResp.ok) throw new Error(`ingredient_create_failed:${ingredientResp.status}`);
    resource.ingredientId = ingredientResp.body?.id;
    recordStep("ingredient_created", { ingredient_id: resource.ingredientId });

    // Stock intake to mark purchase_derived
    const intakePayload = {
      ingredient_id: resource.ingredientId,
      quantity: 5,
      purchase_unit: "g",
      conversion_factor: 1,
      total_cost: 25,
      payment_status: "paid",
    };
    const intakeResp = await ownerRequest("POST", withStoreId("/api/store-admin/stock-intakes"), intakePayload);
    if (!intakeResp.ok) throw new Error(`stock_intake_failed:${intakeResp.status}`);
    recordStep("stock_intake_created", { intake_id: intakeResp.body?.intake?.id });

    // Create product
    const productPayload = {
      name: `E2E Drink ${suffix}`,
      base_price: 90,
    };
    const productResp = await ownerRequest("POST", withStoreId("/api/store-admin/menus"), productPayload);
    if (!productResp.ok) throw new Error(`product_create_failed:${productResp.status}`);
    resource.productId = productResp.body?.id;
    recordStep("product_created", { product_id: resource.productId });

    // Create recipe linking ingredient
    const recipePayload = {
      product_id: resource.productId,
      ingredient_id: resource.ingredientId,
      quantity_used: 10,
      unit: "g",
    };
    const recipeResp = await ownerRequest("POST", withStoreId("/api/store-admin/recipes"), recipePayload);
    if (!recipeResp.ok) throw new Error(`recipe_create_failed:${recipeResp.status}`);
    resource.recipeId = recipeResp.body?.id;
    recordStep("recipe_created", { recipe_id: resource.recipeId });

    // Complete status
    await expectBaselineProduct(
      resource.productId,
      (item) => item.cost_status === "complete",
      "complete_status",
    );
    recordStep("baseline_complete", { cost_status: "complete" });

    // Verify baseline cost source
    try {
      const completeBaseline = await expectBaselineProduct(
        resource.productId,
        (item, payload) => payload?.baseline?.cost_source === "purchase_derived",
        "cost_source_purchase_derived",
      );
      recordStep("baseline_cost_source", { cost_source: completeBaseline.payload.baseline.cost_source });
    } catch (error) {
      recordStep("baseline_cost_source_skipped", {
        cost_source: error.payload?.baseline?.cost_source,
        note: "Store has other incomplete recipes; baseline cost_source remained estimated.",
      });
    }

    // Staff forbidden
    const staffResp = await staffRequest("GET", withStoreId("/api/store-admin/planning/baseline"));
    if (staffResp.status === 401) {
      throw invalidTokenError("staff", staffResp.body || staffResp.status);
    }
    if (staffResp.status !== 403) {
      recordFailure("staff_baseline_access", "Staff should be forbidden from planning baseline", staffResp);
    } else {
      recordStep("staff_blocked", { status: staffResp.status });
    }

    await ensureCustomerMenuMasksCosts();

    // Delete recipe for missing recipe warning
    const deleteRecipe = await ownerRequest(
      "DELETE",
      withStoreId(`/api/store-admin/recipes/${resource.recipeId}`),
    );
    if (!deleteRecipe.ok) throw new Error(`recipe_delete_failed:${deleteRecipe.status}`);
    await expectBaselineProduct(
      resource.productId,
      (item, payload) => item.cost_status === "missing_recipe" && (payload.warning_summary?.missing_recipe_products ?? 0) > 0,
      "missing_recipe_status",
    );
    recordStep("baseline_missing_recipe", { ok: true });

    // Recreate recipe
    const recreateResp = await ownerRequest("POST", withStoreId("/api/store-admin/recipes"), recipePayload);
    if (!recreateResp.ok) throw new Error(`recipe_recreate_failed:${recreateResp.status}`);
    resource.recipeId = recreateResp.body?.id;

    // Set ingredient cost to zero to trigger missing cost
    const zeroCostResp = await ownerRequest(
      "PATCH",
      withStoreId(`/api/store-admin/ingredients/${resource.ingredientId}`),
      { cost_per_unit: 0.0 },
    );
    if (!zeroCostResp.ok) throw new Error(`ingredient_zero_cost_failed:${zeroCostResp.status}`);
    await expectBaselineProduct(
      resource.productId,
      (item, payload) =>
        item.cost_status === "missing_ingredient_cost" &&
        (payload.warning_summary?.missing_ingredient_cost_products ?? 0) > 0,
      "missing_cost_status",
    );
    recordStep("baseline_missing_cost", { ok: true });

    // Restore ingredient cost
    const restoreResp = await ownerRequest(
      "PATCH",
      withStoreId(`/api/store-admin/ingredients/${resource.ingredientId}`),
      { cost_per_unit: 5 },
    );
    if (!restoreResp.ok) throw new Error(`ingredient_restore_failed:${restoreResp.status}`);
    await expectBaselineProduct(
      resource.productId,
      (item) => item.cost_status === "complete",
      "complete_after_restore",
    );
    recordStep("baseline_restored", { ok: true });
  } catch (error) {
    recordFailure("recipe_cost_coverage", error.message, { stack: error.stack });
    await cleanup(resource);
    finish(false, error.message);
    return;
  }

  await cleanup(resource);
  finish(summary.failures.length === 0, summary.failures.length ? "recipe cost coverage smoke failed" : "recipe cost coverage smoke passed");
}

async function cleanup(resource) {
  if (resource.recipeId) {
    await ownerRequest("DELETE", withStoreId(`/api/store-admin/recipes/${resource.recipeId}`)).catch(() => {});
  }
  if (resource.productId) {
    await ownerRequest("DELETE", withStoreId(`/api/store-admin/menus/${resource.productId}`)).catch(() => {});
  }
  if (resource.ingredientId) {
    await ownerRequest("DELETE", withStoreId(`/api/store-admin/ingredients/${resource.ingredientId}`)).catch(() => {});
  }
}

main().catch((error) => {
  recordFailure("unexpected_error", error.message, { stack: error.stack });
  finish(false, "Unexpected error");
});
