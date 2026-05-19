export type LiffProfile = { userId: string; displayName: string };

export type MenuItem = {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  base_price: number;
  is_special?: boolean;
  category?: string | null;
};

export type CartItem = {
  productId?: string | null;
  productNameSnapshot: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  options?: Record<string, unknown>;
  note?: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
export const DEFAULT_STORE_ID = import.meta.env.VITE_DEFAULT_STORE_ID || import.meta.env.NEXT_PUBLIC_DEFAULT_STORE_ID || "348544d2-9a2c-4ba4-8875-bc106fed752e";

async function parseJson<T>(resp: Response): Promise<T> {
  if (!resp.ok) throw new Error(await resp.text() || "Request failed");
  return resp.json() as Promise<T>;
}

export async function upsertLineCustomer(input: { storeId?: string; lineUserId: string; displayName: string; phone?: string }) {
  const resp = await fetch(`${API_BASE}/api/customers/line`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      store_id: input.storeId || DEFAULT_STORE_ID,
      line_user_id: input.lineUserId,
      display_name: input.displayName,
      phone: input.phone || null,
    }),
  });
  return parseJson<{ customer_id: string }>(resp);
}

export async function fetchMenus(input?: { storeId?: string; channelId?: string }) {
  const qs = new URLSearchParams({ store_id: input?.storeId || DEFAULT_STORE_ID });
  if (input?.channelId) qs.set("channel_id", input.channelId);
  const resp = await fetch(`${API_BASE}/api/menus?${qs.toString()}`);
  return parseJson<MenuItem[]>(resp);
}

export async function createOrder(input: { storeId?: string; customerId: string; pickupTime?: string; customerNote?: string }) {
  const resp = await fetch(`${API_BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      store_id: input.storeId || DEFAULT_STORE_ID,
      customer_id: input.customerId,
      pickup_time: input.pickupTime || null,
      customer_note: input.customerNote || null,
    }),
  });
  const arr = await parseJson<any[]>(resp);
  return arr[0];
}

export async function addOrderItem(orderId: string, item: CartItem) {
  const resp = await fetch(`${API_BASE}/api/orders/${orderId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product_id: item.productId || null,
      product_name_snapshot: item.productNameSnapshot,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      unit_cost: item.unitCost,
      options: item.options || null,
      note: item.note || null,
    }),
  });
  const arr = await parseJson<any[]>(resp);
  return arr[0];
}

export async function getOrderDetail(orderId: string) {
  const resp = await fetch(`${API_BASE}/api/orders/${orderId}`);
  const arr = await parseJson<any[]>(resp);
  return arr[0];
}

export async function uploadPaymentSlip(input: { orderId: string; customerId: string; amount: number; slipUrl?: string; slipFileName?: string; slipStoragePath?: string }) {
  const resp = await fetch(`${API_BASE}/api/payments/upload-slip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: input.orderId,
      customer_id: input.customerId,
      amount: input.amount,
      slip_url: input.slipUrl || null,
      slip_file_name: input.slipFileName || null,
      slip_storage_path: input.slipStoragePath || null,
    }),
  });
  const arr = await parseJson<any[]>(resp);
  return arr[0];
}
