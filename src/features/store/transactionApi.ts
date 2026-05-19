export type LiffCartItem = { menuId: string; quantity: number; note?: string };

const API_BASE = import.meta.env.VITE_TRANSACTION_API_URL ?? "http://localhost:8000";
const DEFAULT_STORE_ID = "348544d2-9a2c-4ba4-8875-bc106fed752e";

export async function createLineOaOrder(input: {
  lineUserId: string;
  lineDisplayName: string;
  phone?: string;
  pickupTime: string;
  orderNote?: string;
  items: LiffCartItem[];
}) {
  const resp = await fetch(`${API_BASE}/v1/orders/line-oa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      line_user_id: input.lineUserId,
      line_display_name: input.lineDisplayName,
      phone: input.phone || null,
      pickup_time: input.pickupTime,
      order_note: input.orderNote || null,
      store_id: DEFAULT_STORE_ID,
      items: input.items.map((i) => ({ product_id: i.menuId, quantity: i.quantity, note: i.note })),
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || "Failed to create order");
  }
  return resp.json();
}
