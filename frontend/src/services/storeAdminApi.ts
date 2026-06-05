import { supabase } from "@/lib/supabase";

const BACKEND_BASE = (import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export type FeeType = "none" | "percent" | "fixed";
export type ChannelType = "direct" | "delivery" | "manual";

export type ApiSalesChannel = {
  id: string;
  store_id: string;
  name: string;
  type: ChannelType;
  fee_type: FeeType;
  fee_value: number;
  is_active?: boolean;
  created_at?: string;
};

export type ApiChannelPrice = {
  id: string;
  store_id: string;
  product_id: string;
  channel_id: string;
  price: number;
  product_name?: string | null;
  channel_name?: string | null;
  created_at?: string;
};

export type ApiProduct = {
  id: string;
  store_id: string;
  name: string;
  category_id?: string | null;
  category_name?: string | null;
  base_price: number;
  is_active?: boolean;
  is_special?: boolean;
  image_url?: string | null;
  description?: string | null;
  created_at?: string;
};

export type ApiCategory = {
  id: string;
  store_id: string;
  name: string;
  sort_order?: number | null;
};

export type ApiIngredient = {
  id: string;
  store_id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  current_stock: number;
  low_stock_threshold: number;
  supplier_name?: string | null;
  is_active?: boolean;
  created_at?: string;
};

export type ApiRecipe = {
  id: string;
  store_id: string;
  product_id: string;
  ingredient_id: string;
  quantity_used: number;
  product_name?: string | null;
  ingredient_name?: string | null;
  ingredient_unit?: string | null;
  ingredient_cost_per_unit?: number;
  line_cost?: number;
};

export type ProductSummary = {
  id: string;
  name: string;
  is_active?: boolean;
  base_price?: number;
};

export type ChannelPricingPayload = {
  price: number;
  product_id: string;
  channel_id: string;
};

export type SalesChannelPayload = {
  name: string;
  type: ChannelType;
  fee_type: FeeType;
  fee_value: number;
  is_active?: boolean;
};

export type ProductPayload = {
  name: string;
  base_price: number;
  category_id?: string | null;
  category_name?: string;
  is_active?: boolean;
  is_special?: boolean;
  image_url?: string | null;
  description?: string | null;
};

export type IngredientPayload = {
  name: string;
  unit: string;
  cost_per_unit: number;
  current_stock: number;
  low_stock_threshold: number;
  supplier_name?: string | null;
  is_active?: boolean;
};

export type RecipePayload = {
  product_id: string;
  ingredient_id: string;
  quantity_used: number;
};

export type ApiOrderItem = {
  id: string;
  store_id: string;
  order_id: string;
  product_id: string;
  product_name?: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
  line_cost: number;
  line_profit: number;
  created_at?: string;
};

export type ApiOrder = {
  id: string;
  store_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  channel_id?: string | null;
  channel_name?: string | null;
  order_type?: string | null;
  pickup_type?: string | null;
  pickup_time?: string | null;
  status: string;
  payment_status: string;
  subtotal: number;
  discount_amount: number;
  channel_fee: number;
  total_amount: number;
  total_cost: number;
  gross_profit: number;
  note?: string | null;
  cancelled_reason?: string | null;
  cancelled_at?: string | null;
  created_at?: string;
  updated_at?: string;
  items?: ApiOrderItem[];
  mock_notification?: string;
};

export type OrderPayload = {
  customer_id?: string | null;
  channel_id?: string | null;
  order_type?: string;
  pickup_type?: string;
  pickup_time?: string;
  status?: string;
  payment_status?: string;
  subtotal?: number;
  discount_amount?: number;
  channel_fee?: number;
  total_amount?: number;
  total_cost?: number;
  gross_profit?: number;
  note?: string;
  items?: OrderItemPayload[];
};

export type OrderStatusPayload = {
  status: string;
  note?: string;
};

export type OrderCancelPayload = {
  reason?: string;
};

export type OrderItemPayload = {
  product_id: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
};

export type ApiPayment = {
  id: string;
  store_id: string;
  order_id: string;
  order_status?: string | null;
  order_payment_status?: string | null;
  customer_name?: string | null;
  amount: number;
  method: string;
  status: string;
  slip_url?: string | null;
  slip_storage_path?: string | null;
  slip_file_name?: string | null;
  submitted_at?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  reject_reason?: string | null;
  created_at?: string;
  mock_notification?: string;
  message?: string;
};

export type PaymentSlipPreviewResponse = {
  payment_id: string;
  signed_url: string;
  expires_in: number;
  file_name?: string | null;
  submitted_at?: string | null;
};

export type PaymentPayload = {
  amount?: number;
  method?: "transfer" | "bank_transfer" | "promptpay" | "cash" | "other";
  slip_url?: string;
  slip_storage_path?: string;
  slip_file_name?: string;
};

export type PaymentUpdatePayload = {
  amount?: number;
  method?: "transfer" | "bank_transfer" | "promptpay" | "cash" | "other";
  status?: "pending" | "pending_review" | "paid" | "rejected" | "refunded";
  note?: string;
};

export type PaymentSubmitSlipPayload = {
  slip_url?: string;
  slip_storage_path?: string;
  slip_file_name?: string;
  note?: string;
};

export type PaymentApprovePayload = {
  note?: string;
};

export type PaymentRejectPayload = {
  reason?: string;
  note?: string;
};

export type ApiCustomer = {
  id: string;
  name: string | null;
  phone: string | null;
  line_binding_status: "linked" | "unlinked";
  line_user_id_masked: string | null;
  created_at?: string;
};

export type LineBindingResponse = {
  customer_id: string;
  line_binding_status: "linked" | "unlinked";
  line_user_id_masked: string | null;
};

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("unauthorized");
  return token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    ...(init || {}),
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
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

export const storeAdminApi = {
  async listSalesChannels(): Promise<ApiSalesChannel[]> {
    const data = await request<{ items: ApiSalesChannel[] }>("/api/store-admin/channels");
    return data.items ?? [];
  },

  async createSalesChannel(payload: SalesChannelPayload): Promise<ApiSalesChannel> {
    return request<ApiSalesChannel>("/api/store-admin/channels", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateSalesChannel(id: string, payload: Partial<SalesChannelPayload>): Promise<ApiSalesChannel> {
    return request<ApiSalesChannel>(`/api/store-admin/channels/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deleteSalesChannel(id: string): Promise<{ status: string }> {
    return request<{ status: string }>(`/api/store-admin/channels/${id}`, {
      method: "DELETE",
    });
  },

  async listChannelPricing(): Promise<{ items: ApiChannelPrice[]; products: ProductSummary[]; channels: ApiSalesChannel[]; store_id: string }>
  {
    return request("/api/store-admin/channel-pricing");
  },

  async createChannelPrice(payload: ChannelPricingPayload): Promise<ApiChannelPrice> {
    return request<ApiChannelPrice>("/api/store-admin/channel-pricing", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateChannelPrice(id: string, payload: Partial<ChannelPricingPayload>): Promise<ApiChannelPrice> {
    return request<ApiChannelPrice>(`/api/store-admin/channel-pricing/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deleteChannelPrice(id: string): Promise<{ status: string }> {
    return request<{ status: string }>(`/api/store-admin/channel-pricing/${id}`, {
      method: "DELETE",
    });
  },

  // Menus (products + categories)
  async listMenus(): Promise<{ items: ApiProduct[]; categories: ApiCategory[]; store_id: string }> {
    return request("/api/store-admin/menus");
  },

  async createMenu(payload: ProductPayload): Promise<ApiProduct> {
    return request<ApiProduct>("/api/store-admin/menus", { method: "POST", body: JSON.stringify(payload) });
  },

  async updateMenu(id: string, payload: Partial<ProductPayload>): Promise<ApiProduct> {
    return request<ApiProduct>(`/api/store-admin/menus/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },

  async deleteMenu(id: string): Promise<{ status: string }> {
    return request<{ status: string }>(`/api/store-admin/menus/${id}`, { method: "DELETE" });
  },

  // Ingredients
  async listIngredients(): Promise<{ items: ApiIngredient[]; store_id: string }> {
    return request("/api/store-admin/ingredients");
  },

  async createIngredient(payload: IngredientPayload): Promise<ApiIngredient> {
    return request<ApiIngredient>("/api/store-admin/ingredients", { method: "POST", body: JSON.stringify(payload) });
  },

  async updateIngredient(id: string, payload: Partial<IngredientPayload>): Promise<ApiIngredient> {
    return request<ApiIngredient>(`/api/store-admin/ingredients/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },

  async deleteIngredient(id: string): Promise<{ status: string }> {
    return request<{ status: string }>(`/api/store-admin/ingredients/${id}`, { method: "DELETE" });
  },

  // Recipes
  async listRecipes(): Promise<{ items: ApiRecipe[]; products: ApiProduct[]; ingredients: ApiIngredient[]; store_id: string }> {
    return request("/api/store-admin/recipes");
  },

  async createRecipe(payload: RecipePayload): Promise<ApiRecipe> {
    return request<ApiRecipe>("/api/store-admin/recipes", { method: "POST", body: JSON.stringify(payload) });
  },

  async updateRecipe(id: string, payload: Partial<RecipePayload>): Promise<ApiRecipe> {
    return request<ApiRecipe>(`/api/store-admin/recipes/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },

  async deleteRecipe(id: string): Promise<{ status: string }> {
    return request<{ status: string }>(`/api/store-admin/recipes/${id}`, { method: "DELETE" });
  },

  // Orders
  async listOrders(): Promise<{ items: ApiOrder[]; store_id: string }> {
    return request("/api/store-admin/orders");
  },

  async getOrder(id: string): Promise<ApiOrder> {
    return request<ApiOrder>(`/api/store-admin/orders/${id}`);
  },

  async createOrder(payload: OrderPayload): Promise<{ id: string; status: string }> {
    return request<{ id: string; status: string }>("/api/store-admin/orders", { method: "POST", body: JSON.stringify(payload) });
  },

  async updateOrder(id: string, payload: Partial<OrderPayload>): Promise<{ id: string; status: string; mock_notification?: string }> {
    return request<{ id: string; status: string; mock_notification?: string }>(`/api/store-admin/orders/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },

  async updateOrderStatus(id: string, payload: OrderStatusPayload): Promise<{ id: string; status: string; mock_notification?: string }> {
    return request<{ id: string; status: string; mock_notification?: string }>(`/api/store-admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify(payload) });
  },

  async cancelOrder(id: string, payload: OrderCancelPayload): Promise<{ id: string; status: string }> {
    return request<{ id: string; status: string }>(`/api/store-admin/orders/${id}/cancel`, { method: "POST", body: JSON.stringify(payload) });
  },

  async listOrderItems(orderId: string): Promise<{ items: ApiOrderItem[]; order_id: string; store_id: string }> {
    return request(`/api/store-admin/orders/${orderId}/items`);
  },

  async createOrderItem(orderId: string, payload: OrderItemPayload): Promise<ApiOrderItem> {
    return request<ApiOrderItem>(`/api/store-admin/orders/${orderId}/items`, { method: "POST", body: JSON.stringify(payload) });
  },

  async updateOrderItem(itemId: string, payload: Partial<OrderItemPayload>): Promise<ApiOrderItem> {
    return request<ApiOrderItem>(`/api/store-admin/order-items/${itemId}`, { method: "PATCH", body: JSON.stringify(payload) });
  },

  async deleteOrderItem(itemId: string): Promise<{ status: string }> {
    return request<{ status: string }>(`/api/store-admin/order-items/${itemId}`, { method: "DELETE" });
  },

  // Payments
  async listPayments(): Promise<{ items: ApiPayment[]; payment_queue: ApiPayment[]; store_id: string }> {
    return request("/api/store-admin/payments");
  },

  async listOrderPayments(orderId: string): Promise<{ items: ApiPayment[]; order_id: string; store_id: string }> {
    return request(`/api/store-admin/orders/${orderId}/payments`);
  },

  async createOrderPayment(orderId: string, payload: PaymentPayload): Promise<{ id: string; status: string }> {
    return request<{ id: string; status: string }>(`/api/store-admin/orders/${orderId}/payments`, { method: "POST", body: JSON.stringify(payload) });
  },

  async updatePayment(paymentId: string, payload: PaymentUpdatePayload): Promise<{ id: string; status: string }> {
    return request<{ id: string; status: string }>(`/api/store-admin/payments/${paymentId}`, { method: "PATCH", body: JSON.stringify(payload) });
  },

  async submitPaymentSlip(paymentId: string, payload: PaymentSubmitSlipPayload): Promise<{ id: string; status: string }> {
    return request<{ id: string; status: string }>(`/api/store-admin/payments/${paymentId}/submit-slip`, { method: "POST", body: JSON.stringify(payload) });
  },

  async approvePayment(paymentId: string, payload?: PaymentApprovePayload): Promise<{ id: string; status: string; mock_notification?: string }> {
    return request<{ id: string; status: string; mock_notification?: string }>(`/api/store-admin/payments/${paymentId}/approve`, { method: "POST", body: JSON.stringify(payload || {}) });
  },

  async rejectPayment(paymentId: string, payload: PaymentRejectPayload): Promise<{ id: string; status: string; message?: string }> {
    return request<{ id: string; status: string; message?: string }>(`/api/store-admin/payments/${paymentId}/reject`, { method: "POST", body: JSON.stringify(payload) });
  },

  async getPaymentSlipPreview(paymentId: string): Promise<PaymentSlipPreviewResponse> {
    return request<PaymentSlipPreviewResponse>(`/api/store-admin/payments/${paymentId}/slip-preview`);
  },

  // Customers + LINE binding
  async listCustomers(): Promise<{ items: ApiCustomer[]; store_id: string }> {
    return request("/api/store-admin/customers");
  },

  async bindLineUser(customerId: string, lineUserId: string): Promise<LineBindingResponse> {
    return request<LineBindingResponse>(`/api/store-admin/customers/${customerId}/bind-line`, {
      method: "POST",
      body: JSON.stringify({ line_user_id: lineUserId }),
    });
  },

  async unbindLineUser(customerId: string): Promise<LineBindingResponse> {
    return request<LineBindingResponse>(`/api/store-admin/customers/${customerId}/unbind-line`, {
      method: "DELETE",
    });
  },
};
