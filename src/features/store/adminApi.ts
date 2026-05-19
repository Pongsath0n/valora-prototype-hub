const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const DEFAULT_STORE_ID = import.meta.env.VITE_DEFAULT_STORE_ID || import.meta.env.NEXT_PUBLIC_DEFAULT_STORE_ID || "348544d2-9a2c-4ba4-8875-bc106fed752e";

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) throw new Error(await resp.text() || "Request failed");
  return resp.json() as Promise<T>;
}

export async function getAdminOrders(filters?: { storeId?: string; orderStatus?: string; paymentStatus?: string }) {
  const qs = new URLSearchParams({ store_id: filters?.storeId || DEFAULT_STORE_ID });
  if (filters?.orderStatus) qs.set("order_status", filters.orderStatus);
  if (filters?.paymentStatus) qs.set("payment_status", filters.paymentStatus);
  return json<any[]>(await fetch(`${API_BASE}/api/admin/orders?${qs.toString()}`));
}

export async function getPendingPayments(storeId?: string) {
  const qs = new URLSearchParams({ store_id: storeId || DEFAULT_STORE_ID });
  return json<any[]>(await fetch(`${API_BASE}/api/admin/payments/pending?${qs.toString()}`));
}

export async function getOrderDetail(orderId: string) {
  const arr = await json<any[]>(await fetch(`${API_BASE}/api/orders/${orderId}`));
  return arr[0];
}

export async function approveSlip(paymentId: string) {
  const arr = await json<any[]>(await fetch(`${API_BASE}/api/payments/${paymentId}/approve`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }));
  return arr[0];
}

export async function rejectSlip(paymentId: string, rejectReason: string) {
  const arr = await json<any[]>(await fetch(`${API_BASE}/api/payments/${paymentId}/reject`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reject_reason: rejectReason }) }));
  return arr[0];
}

export async function patchOrderStatus(orderId: string, orderStatus: "preparing"|"ready"|"completed"|"cancelled", cancelledReason?: string) {
  const arr = await json<any[]>(await fetch(`${API_BASE}/api/orders/${orderId}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_status: orderStatus, cancelled_reason: cancelledReason || null }) }));
  return arr[0];
}
