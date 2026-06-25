import type { CustomerMenuItem } from "@/services/customerApi";
import type { KioskOrderItemOptions } from "@/services/storeAdminApi";

import { DEFAULT_SWEETNESS, SWEETNESS_LEVELS } from "./kioskConfig";
import type { CartItem, DraftItem } from "./types";

/**
 * Pure, side-effect-free helpers for cart math and payload construction.
 * Kept separate from React so they can be unit-tested and reused anywhere.
 */

export function formatCurrency(value: number): string {
  return value.toLocaleString("th-TH", { style: "currency", currency: "THB" });
}

/** Per-unit add-on cost for a single line item. */
export function getAddonUnitTotal(item: CartItem): number {
  return item.addons.reduce((sum, addon) => sum + addon.price * addon.quantity, 0);
}

/** Price for one unit (base + add-ons), excluding quantity. */
export function getItemUnitPrice(item: CartItem): number {
  return item.basePrice + getAddonUnitTotal(item);
}

/** Full line total (unit price * quantity). */
export function getItemLineTotal(item: CartItem): number {
  return getItemUnitPrice(item) * item.quantity;
}

/** Sum of all line totals in the cart. */
export function getCartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + getItemLineTotal(item), 0);
}

/** Clamp an arbitrary sweetness value to an allowed level. */
export function sanitizeSweetness(value: number | null | undefined): number {
  if (value != null && (SWEETNESS_LEVELS as readonly number[]).includes(value)) {
    return value;
  }
  return DEFAULT_SWEETNESS;
}

/**
 * Build the per-item `options` payload sent to the kiosk endpoint.
 * Returns undefined when there are no options, to keep the payload minimal.
 *
 * NOTE: This is the exact contract the backend expects — do not reshape.
 */
export function buildItemOptions(item: CartItem): KioskOrderItemOptions | undefined {
  const options: KioskOrderItemOptions = {};
  if (typeof item.sweetness === "number") {
    options.sweetness = item.sweetness;
  }
  if (item.addons.length > 0) {
    options.addons = item.addons.map((addon) => ({
      addon_id: addon.addon_id,
      quantity: addon.quantity,
    }));
  }
  if (item.note) {
    options.note = item.note;
  }
  return Object.keys(options).length ? options : undefined;
}

/** Per-unit price for an in-progress dialog draft (base + selected add-ons). */
export function getDraftUnitPrice(product: CustomerMenuItem, draft: DraftItem): number {
  const addonTotal = product.addons.reduce(
    (sum, addon) => sum + addon.price * (draft.addons[addon.addon_id] ?? 0),
    0,
  );
  return product.price + addonTotal;
}

/** Full line total for an in-progress dialog draft. */
export function getDraftLineTotal(product: CustomerMenuItem, draft: DraftItem): number {
  return getDraftUnitPrice(product, draft) * Math.max(1, draft.quantity);
}
