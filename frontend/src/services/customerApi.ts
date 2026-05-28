const BACKEND_BASE = (import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export type CustomerMenuItem = {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  price: number;
  category?: string | null;
  available: boolean;
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
  status: string;
  payment_status: string;
  total_amount: number;
  pickup_time?: string | null;
  created_at?: string | null;
  customer_name?: string | null;
  items: CustomerOrderItem[];
};

type CustomerOrderCreatePayload = {
  customer: {
    name: string;
    phone: string;
    line_user_id?: string;
  };
  items: { product_id: string; quantity: number }[];
  pickup_time: string;
  note?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    ...(init || {}),
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const reason = (body as any)?.detail || (body as any)?.error || "request_failed";
    throw new Error(typeof reason === "string" ? reason : "request_failed");
  }

  return body as T;
}

export const customerApi = {
  async listMenu(): Promise<CustomerMenuItem[]> {
    const data = await request<{ items: CustomerMenuItem[] }>("/api/customer/menu");
    return (data.items ?? []).filter((x) => x.available);
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

  async getOrder(orderId: string): Promise<CustomerOrderSummary> {
    return request<CustomerOrderSummary>(`/api/customer/orders/${orderId}`);
  },
};

