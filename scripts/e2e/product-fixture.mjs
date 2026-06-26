import { ENV } from "./env.mjs";

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

function parseMenuItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.items)) {
    return payload.items;
  }
  if (payload && payload.data && Array.isArray(payload.data.items)) {
    return payload.data.items;
  }
  return [];
}

function normalizeProduct(row) {
  if (!row) return null;
  const id = String(row.id ?? row.product_id ?? "").trim();
  if (!id) return null;
  const priceValue = row.price ?? row.base_price ?? row.unit_price;
  return {
    id,
    name: row.name || "Unknown product",
    price: Number(priceValue ?? 0) || 0,
    available: row.available ?? row.is_active ?? true,
    storeId: row.store_id ? String(row.store_id) : null,
    raw: row,
  };
}

function buildMenuUrl(baseUrl, storeId) {
  const url = new URL("/api/customer/menu", baseUrl);
  if (storeId) {
    url.searchParams.set("store_id", storeId);
  }
  return url.toString();
}

export async function resolveProductFixture(options = {}) {
  const backendUrl = options.backendUrl || ENV.backendUrl;
  if (!backendUrl) {
    const error = new Error("backend_url_missing");
    error.detail = { backendUrl };
    throw error;
  }

  const preferredStoreId = options.storeId || ENV.storeId || "";
  const preferredProductId = options.productId || ENV.productId || "";

  const attempts = preferredStoreId ? [preferredStoreId, ""] : [""];
  let lastError = null;
  let resolvedItems = [];
  let resolvedStoreId = preferredStoreId;

  for (const candidateStoreId of attempts) {
    const resp = await fetchJson(buildMenuUrl(backendUrl, candidateStoreId || undefined));
    if (!resp.ok) {
      lastError = resp;
      continue;
    }
    const items = parseMenuItems(resp.body);
    if (items.length === 0) {
      lastError = { status: resp.status, body: resp.body, message: "no_menu_items" };
      continue;
    }
    resolvedItems = items;
    resolvedStoreId = resp.body?.store_id || candidateStoreId || resolvedStoreId || "";
    break;
  }

  if (!resolvedItems.length) {
    const error = new Error("menu_lookup_failed");
    error.detail = lastError || {};
    throw error;
  }

  const normalized = resolvedItems
    .map(normalizeProduct)
    .filter((item) => item && item.available);

  if (!normalized.length) {
    const error = new Error("no_active_products");
    error.detail = { items: resolvedItems.length };
    throw error;
  }

  let chosen = null;
  if (preferredProductId) {
    chosen = normalized.find((item) => item.id === preferredProductId);
  }
  if (!chosen) {
    chosen = normalized[0];
  }

  const fallbackPrice = Number(options.fallbackPrice ?? 0) || 0;
  const unitPrice = chosen.price > 0 ? chosen.price : fallbackPrice;

  return {
    productId: chosen.id,
    productName: chosen.name,
    unitPrice,
    storeId: resolvedStoreId || chosen.storeId || "",
    menuItems: resolvedItems,
  };
}
