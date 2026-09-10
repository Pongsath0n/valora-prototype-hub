const BACKEND_BASE = (import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export type CustomerProductAddon = {
  addon_id: string;
  code?: string | null;
  name: string;
  price: number;
  max_quantity?: number | null;
  addon_type?: string | null;
};

export type CustomerMenuItem = {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  price: number;
  category?: string | null;
  available: boolean;
  allow_sweetness: boolean;
  default_sweetness: number;
  addons: CustomerProductAddon[];
};

export type CustomerOrderItem = {
  product_id: string;
  product_name?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type CustomerOrderSummary = {
  order_id: string;
  order_number?: string | null;
  order_no?: string | null;
  public_token?: string | null;
  status: string;
  payment_status: string;
  total_amount: number;
  pickup_time?: string | null;
  created_at?: string | null;
  customer_name?: string | null;
  items: CustomerOrderItem[];
};

export type OrderStatusItem = {
  product_name?: string | null;
  quantity: number;
  line_total: number;
  image_url?: string | null;
};

export type OrderStatusPaymentSummary = {
  status: string;
  method: string;
  amount: number;
};

export type OrderStatusSummary = {
  order_no?: string | null;
  order_status: string;
  payment_status: string;
  pickup_time?: string | null;
  total_amount: number;
  created_at?: string | null;
  customer_name?: string | null;
  items: OrderStatusItem[];
  payment: OrderStatusPaymentSummary;
  public_token?: string | null;
};

export type CustomerOrderItemOptions = {
  sweetness?: number;
  addons?: { addon_id: string; quantity: number }[];
  note?: string;
};

type CustomerOrderItemPayload = {
  product_id: string;
  quantity: number;
  options?: CustomerOrderItemOptions | null;
};

/**
 * Canonical V1 customer order creation payload.
 *
 * Per Backend Contract V1 (BE-FIX-01):
 * - `customer.name` is REQUIRED.
 * - `customer.phone` is OPTIONAL (Healholic self-order does not require phone).
 * - `pickup_time` is OPTIONAL (V1 flow = order-now/wait/pay-at-counter).
 * - `note` is OPTIONAL.
 *
 * The frontend MUST NOT send: price, cost, total, _system, usage_breakdown,
 * or ingredient data. The backend is the sole authority for pricing and snapshots.
 */
export type CustomerOrderCreatePayload = {
  customer: {
    name: string;
    phone?: string;
    line_user_id?: string;
  };
  items: CustomerOrderItemPayload[];
  pickup_time?: string;
  note?: string;
  line_link_token?: string;
};

function extractMenuItems(payload: unknown): CustomerMenuItem[] | null {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const objectPayload = payload as Record<string, unknown>;
  const directItems = (objectPayload as { items?: unknown }).items;
  if (Array.isArray(directItems)) {
    return directItems;
  }

  const nestedData = (objectPayload as { data?: unknown }).data;
  if (Array.isArray(nestedData)) {
    return nestedData;
  }
  if (nestedData && typeof nestedData === "object") {
    const nestedItems = (nestedData as { items?: unknown }).items;
    if (Array.isArray(nestedItems)) {
      return nestedItems;
    }
  }

  return null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${BACKEND_BASE}${path}`, {
      ...(init || {}),
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    });

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      const bodyRecord = (body && typeof body === "object") ? body as Record<string, unknown> : null;
      const reason = bodyRecord?.detail ?? bodyRecord?.error ?? res.statusText;
      throw new Error(
        typeof reason === "string" && reason.trim().length > 0
          ? reason
          : "ไม่สามารถเชื่อมต่อระบบได้",
      );
    }

    if (body == null) {
      throw new Error("ไม่พบข้อมูลจากระบบ");
    }

    return body as T;
  } catch (error) {
    const err = error as { name?: string; message?: string };
    if (err?.name === "AbortError") {
      throw new Error("เซิร์ฟเวอร์ตอบสนองช้า โปรดลองใหม่อีกครั้ง");
    }
    throw error instanceof Error
      ? error
      : new Error("เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
  } finally {
    clearTimeout(timeout);
  }
}

export const customerApi = {
  async listMenu(): Promise<CustomerMenuItem[]> {
    const data = await request<{ items?: CustomerMenuItem[]; store_id?: string } | CustomerMenuItem[]>(
      "/api/customer/menu",
      {
        cache: "no-store",
      },
    );

    const items = extractMenuItems(data);
    if (!Array.isArray(items)) {
      throw new Error("ไม่พบข้อมูลจากระบบ");
    }

    return items.filter((x) => x.available);
  },

  async getMenuDetail(productId: string): Promise<CustomerMenuItem> {
    return request<CustomerMenuItem>(`/api/customer/menu/${productId}`);
  },

  async createOrder(payload: CustomerOrderCreatePayload): Promise<CustomerOrderSummary> {
    return request<CustomerOrderSummary>("/api/customer/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getOrder(orderId: string, token: string): Promise<CustomerOrderSummary> {
    const trimmedToken = token?.trim();
    if (!trimmedToken) {
      throw new Error("จำเป็นต้องมีโทเคนสถานะล่าสุดเพื่อโหลดคำสั่งซื้อ");
    }
    const query = new URLSearchParams({ token: trimmedToken });
    return request<CustomerOrderSummary>(`/api/customer/orders/${orderId}?${query.toString()}`);
  },

  async getOrderStatusByToken(token: string): Promise<OrderStatusSummary> {
    const query = new URLSearchParams({ token });
    return request<OrderStatusSummary>(`/api/customer/orders/status?${query.toString()}`);
  },
};

