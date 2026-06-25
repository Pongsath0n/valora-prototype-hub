/**
 * Domain types for the Staff Kiosk walk-in order flow.
 *
 * These types are intentionally UI-agnostic so they can be reused by the
 * orchestration hook, presentational components, and any future surfaces
 * (e.g. a tablet POS or a SaaS multi-tenant kiosk).
 */

export type PaymentMethod = "promptpay" | "cash";

/** A single add-on/topping selection captured on a cart line. */
export type CartAddonSelection = {
  addon_id: string;
  name: string;
  price: number;
  quantity: number;
  code?: string | null;
  max_quantity?: number | null;
};

/** A fully-configured line item sitting in the cart. */
export type CartItem = {
  productId: string;
  name: string;
  basePrice: number;
  quantity: number;
  sweetness?: number;
  note?: string;
  addons: CartAddonSelection[];
};

/** In-progress edits inside the item options dialog (before commit to cart). */
export type DraftItem = {
  quantity: number;
  sweetness?: number;
  note?: string;
  /** addon_id -> quantity */
  addons: Record<string, number>;
};

/** The three high-level steps of the kiosk wizard. */
export type Step = "menu" | "payment" | "success";

export type StepDescriptor = {
  id: Step;
  /** Short label shown in the step indicator, e.g. "เลือกเมนู". */
  label: string;
};
