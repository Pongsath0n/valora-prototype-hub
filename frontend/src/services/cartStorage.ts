export type CartItemAddonSelection = {
  addon_id: string;
  code?: string | null;
  name?: string | null;
  price?: number;
  quantity: number;
};

export type CartItemOptions = {
  sweetness?: number;
  addons?: CartItemAddonSelection[];
  note?: string;
};

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
  options?: CartItemOptions;
};

const CART_KEY = "valora:liff:cart";
const LAST_ORDER_ID_KEY = "valora:liff:last_order";
const LAST_ORDER_NO_KEY = "valora:liff:last_order_no";
const LAST_ORDER_TOKEN_KEY = "valora:liff:last_order_token";

const SWEETNESS_LEVELS = new Set([0, 25, 50, 75, 100]);

function sanitizeSweetness(value: unknown): number | undefined {
  const numeric = Number(value);
  return SWEETNESS_LEVELS.has(numeric) ? numeric : undefined;
}

function sanitizeAddonSelection(raw: any): CartItemAddonSelection | null {
  const addonId = String(raw?.addon_id ?? "").trim();
  if (!addonId) return null;
  const quantity = Math.max(0, Math.floor(Number(raw?.quantity ?? 0) || 0));
  const price = Number(raw?.price ?? 0) || 0;
  return {
    addon_id: addonId,
    code: raw?.code != null ? String(raw.code) : undefined,
    name: raw?.name != null ? String(raw.name) : undefined,
    price,
    quantity,
  };
}

function normalizeOptions(raw: any, fallbackNote?: any): CartItemOptions | undefined {
  const sweetness = sanitizeSweetness(raw?.sweetness);
  const addons = Array.isArray(raw?.addons)
    ? raw.addons
        .map((addon: any) => sanitizeAddonSelection(addon))
        .filter((addon): addon is CartItemAddonSelection => Boolean(addon && addon.quantity > 0))
    : [];
  const noteValue = raw?.note ?? fallbackNote;
  const note = typeof noteValue === "string" ? noteValue.trim() : undefined;

  const options: CartItemOptions = {};
  if (sweetness !== undefined) {
    options.sweetness = sweetness;
  }
  if (addons.length > 0) {
    options.addons = addons;
  }
  if (note) {
    options.note = note;
  }
  return Object.keys(options).length > 0 ? options : undefined;
}

function normalizeCartItemRecord(item: any): CartItem | null {
  const productId = String(item?.productId ?? "").trim();
  const name = String(item?.name ?? "").trim();
  if (!productId || !name) return null;
  const price = Number(item?.price ?? 0) || 0;
  const quantity = Math.max(1, Number(item?.quantity ?? 1) || 1);
  const options = normalizeOptions(item?.options, item?.note);
  const note = options?.note ?? (item?.note ? String(item.note).trim() : undefined);
  return {
    productId,
    name,
    price,
    quantity,
    note,
    ...(options ? { options } : {}),
  };
}

function safeParse(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeCartItemRecord(item))
      .filter((item): item is CartItem => Boolean(item));
  } catch {
    return [];
  }
}

function persist(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function readCart(): CartItem[] {
  return safeParse();
}

export function writeCart(items: CartItem[]): void {
  persist(items);
}

export function addCartItem(newItem: CartItem): CartItem[] {
  const cart = safeParse();
  const normalized = normalizeCartItemRecord(newItem);
  if (!normalized) {
    return cart;
  }
  const next: CartItem[] = [...cart, normalized];
  persist(next);
  return next;
}

export function reconcileCartWithProductIds(validProductIds: Set<string>): { items: CartItem[]; removedCount: number } {
  const cart = safeParse();
  if (!cart.length) {
    return { items: cart, removedCount: 0 };
  }
  if (!validProductIds || validProductIds.size === 0) {
    persist([]);
    return { items: [], removedCount: cart.length };
  }
  const next = cart.filter((item) => validProductIds.has(item.productId));
  if (next.length !== cart.length) {
    persist(next);
  }
  return { items: next, removedCount: cart.length - next.length };
}

export function removeCartItem(index: number): CartItem[] {
  const cart = safeParse();
  if (index < 0 || index >= cart.length) return cart;
  const next = [...cart.slice(0, index), ...cart.slice(index + 1)];
  persist(next);
  return next;
}

export function updateCartQuantity(index: number, nextQuantity: number): CartItem[] {
  const cart = safeParse();
  if (index < 0 || index >= cart.length) return cart;
  const quantity = Math.max(1, Number(nextQuantity) || 1);
  cart[index] = { ...cart[index], quantity };
  persist(cart);
  return cart;
}

export function clearCart(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CART_KEY);
}

export function getLastOrderId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_ORDER_ID_KEY);
}

export function setLastOrderId(orderId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_ORDER_ID_KEY, orderId);
}

export function getLastOrderNo(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_ORDER_NO_KEY);
}

export function setLastOrderNo(orderNo: string | null | undefined): void {
  if (typeof window === "undefined") return;
  if (!orderNo) {
    window.localStorage.removeItem(LAST_ORDER_NO_KEY);
    return;
  }
  window.localStorage.setItem(LAST_ORDER_NO_KEY, orderNo);
}

export function getLastOrderToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_ORDER_TOKEN_KEY);
}

export function setLastOrderToken(token: string | null | undefined): void {
  if (typeof window === "undefined") return;
  if (!token) {
    window.localStorage.removeItem(LAST_ORDER_TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(LAST_ORDER_TOKEN_KEY, token);
}

export function setLastOrderMetadata(params: { orderId?: string | null; orderNo?: string | null; publicToken?: string | null }): void {
  if (params.orderId) {
    setLastOrderId(params.orderId);
  }
  if (params.orderNo !== undefined) {
    setLastOrderNo(params.orderNo);
  }
  if (params.publicToken !== undefined) {
    setLastOrderToken(params.publicToken);
  }
}

function getAddonUnitTotal(item: CartItem): number {
  if (!item.options?.addons?.length) {
    return 0;
  }
  return item.options.addons.reduce((sum, addon) => {
    const quantity = Math.max(0, Number(addon.quantity) || 0);
    const price = Number(addon.price ?? 0) || 0;
    return sum + price * quantity;
  }, 0);
}

export function getCartItemUnitPrice(item: CartItem): number {
  const base = Number(item.price ?? 0) || 0;
  return base + getAddonUnitTotal(item);
}

export function getCartItemLineTotal(item: CartItem): number {
  const qty = Math.max(1, Number(item.quantity) || 1);
  return getCartItemUnitPrice(item) * qty;
}

function buildAddonSignature(addons: CartItemAddonSelection[] | undefined): string {
  if (!addons?.length) return "";
  return addons
    .map((addon) => `${addon.addon_id}:${addon.quantity}:${addon.code ?? ""}`)
    .join("|");
}

export function getCartItemKey(item: CartItem, index?: number): string {
  const parts = [
    item.productId,
    String(item.options?.sweetness ?? ""),
    buildAddonSignature(item.options?.addons),
    item.note ?? "",
  ];
  if (typeof index === "number") {
    parts.push(String(index));
  }
  return parts.join("::");
}
