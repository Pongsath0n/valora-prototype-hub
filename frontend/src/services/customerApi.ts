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
  slip_submitted: boolean;
  last_submitted_at?: string | null;
  reject_reason?: string | null;
  can_upload_slip?: boolean;
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

export type PaymentInstructionsResponse = {
  enabled: boolean;
  method_label: string;
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  promptpay_id?: string | null;
  note_lines: string[];
  allowed_file_types: string[];
  max_file_mb: number;
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

type CustomerOrderCreatePayload = {
  customer: {
    name: string;
    phone: string;
    line_user_id?: string;
  };
  items: CustomerOrderItemPayload[];
  pickup_time: string;
  note?: string;
  line_link_token?: string;
};

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

    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      const reason = (body as any)?.detail || (body as any)?.error || res.statusText;
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
  } catch (error: any) {
    if (error?.name === "AbortError") {
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

  async lookupOrderStatus(payload: { order_no: string; phone: string }): Promise<OrderStatusSummary> {
    return request<OrderStatusSummary>("/api/customer/orders/lookup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getPaymentInstructions(): Promise<PaymentInstructionsResponse> {
    return request<PaymentInstructionsResponse>("/api/customer/payment-instructions");
  },

  async uploadPaymentSlip(publicToken: string, file: File): Promise<OrderStatusSummary> {
    const formData = new FormData();
    formData.append("public_token", publicToken);
    formData.append("file", file);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(`${BACKEND_BASE}/api/customer/orders/status/slip`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body == null) {
        const reason = (body as any)?.detail || (body as any)?.error || res.statusText;
        throw new Error(
          typeof reason === "string" && reason.trim().length > 0
            ? reason
            : "อัปโหลดหลักฐานไม่สำเร็จ",
        );
      }
      return body as OrderStatusSummary;
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new Error("ระบบตอบสนองช้า โปรดลองใหม่อีกครั้ง");
      }
      throw error instanceof Error ? error : new Error("เกิดข้อผิดพลาดขณะอัปโหลดสลิป");
    } finally {
      clearTimeout(timeout);
    }
  },
};

