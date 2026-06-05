export type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
};

const CART_KEY = "valora:liff:cart";
const LAST_ORDER_ID_KEY = "valora:liff:last_order";
const LAST_ORDER_NO_KEY = "valora:liff:last_order_no";
const LAST_ORDER_TOKEN_KEY = "valora:liff:last_order_token";

function safeParse(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        productId: String(item?.productId ?? ""),
        name: String(item?.name ?? ""),
        price: Number(item?.price ?? 0) || 0,
        quantity: Math.max(1, Number(item?.quantity ?? 1) || 1),
        note: item?.note ? String(item.note) : undefined,
      }))
      .filter((item) => item.productId.trim().length > 0 && item.name.trim().length > 0);
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
  const next: CartItem[] = [
    ...cart,
    {
      ...newItem,
      quantity: Math.max(1, Number(newItem.quantity) || 1),
      note: newItem.note?.trim() || undefined,
    },
  ];
  persist(next);
  return next;
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
