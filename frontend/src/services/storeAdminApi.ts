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

export const INGREDIENT_BASE_UNITS = ["g", "ml", "pcs", "set", "bottle"] as const;
export type IngredientBaseUnit = (typeof INGREDIENT_BASE_UNITS)[number];

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
  allow_sweetness?: boolean;
  default_sweetness?: number;
};

export type ApiProductAddonRecipe = {
  id: string;
  addon_id: string;
  store_id: string;
  ingredient_id: string;
  ingredient_name?: string;
  ingredient_unit?: string | null;
  quantity_used: number;
  unit?: string | null;
  cost_per_unit?: number;
  line_cost?: number;
};

export type ApiProductAddon = {
  id: string;
  store_id: string;
  product_id: string;
  name: string;
  code?: string | null;
  addon_type?: string | null;
  price: number;
  max_quantity?: number | null;
  is_active?: boolean;
  created_at?: string;
  unit_cost?: number | null;
  unit_profit?: number | null;
  has_recipe?: boolean;
  recipes?: ApiProductAddonRecipe[];
};

export type ProductOptionsResponse = {
  product_id: string;
  allow_sweetness: boolean;
  default_sweetness: number;
  addons: ApiProductAddon[];
};

export type ProductOptionsPayload = {
  allow_sweetness?: boolean;
  default_sweetness?: number;
};

export type ProductAddonPayload = {
  name: string;
  code?: string | null;
  addon_type?: string | null;
  price: number;
  max_quantity?: number | null;
  is_active?: boolean;
};

export type ProductAddonUpdatePayload = Partial<ProductAddonPayload>;

export type ProductAddonRecipePayload = {
  ingredient_id: string;
  quantity_used: number;
  unit?: string | null;
};

export type ProductAddonRecipeUpdatePayload = Partial<ProductAddonRecipePayload>;

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
  cost_type?: string | null;
  cost_source?: string | null;
  last_purchase_at?: string | null;
  cost_updated_at?: string | null;
  created_at?: string;
};

export type StockIntake = {
  id: string;
  store_id: string;
  ingredient_id: string;
  ingredient_name?: string | null;
  ingredient_unit?: string | null;
  quantity: number;
  normalized_quantity: number;
  purchase_unit: string;
  conversion_factor: number;
  total_cost: number;
  unit_cost_snapshot?: number | null;
  supplier_name?: string | null;
  payment_status: "paid" | "unpaid";
  paid_at?: string | null;
  due_date?: string | null;
  note?: string | null;
  receipt_url?: string | null;
  receipt_storage_path?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  movement_id?: string | null;
  movement_type?: string | null;
};

export type CreateStockIntakePayload = {
  ingredient_id: string;
  quantity: number;
  purchase_unit: string;
  conversion_factor: number;
  total_cost: number;
  supplier_name?: string;
  payment_status: "paid" | "unpaid";
  paid_at?: string;
  due_date?: string;
  note?: string;
  receipt_url?: string;
  receipt_storage_path?: string;
};

export type StockIntakeResponse = {
  intake: StockIntake;
  ingredient: ApiIngredient;
};

export type ApiRecipe = {
  id: string;
  store_id: string;
  product_id: string;
  ingredient_id: string;
  quantity_used: number;
  unit?: string | null;
  product_name?: string | null;
  ingredient_name?: string | null;
  ingredient_unit?: string | null;
  ingredient_cost_per_unit?: number;
  ingredient_cost_type?: string | null;
  ingredient_is_active?: boolean | null;
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
  allow_sweetness?: boolean;
  default_sweetness?: number;
};

export type IngredientPayload = {
  name: string;
  unit: IngredientBaseUnit;
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
  unit?: string;
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
  option_total?: number;
  option_cost_total?: number;
  total_price?: number;
  total_cost?: number;
  options?: Record<string, unknown> | null;
  created_at?: string;
};

export type LatestPaymentSummary = {
  id?: string | null;
  payment_id?: string | null;
  status?: string | null;
  method?: string | null;
  amount?: number | null;
  slip_submitted?: boolean | null;
  slip_file_name?: string | null;
  slip_storage_path?: string | null;
  submitted_at?: string | null;
  reject_reason?: string | null;
};

export type ApiOrder = {
  id: string;
  store_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  channel_id?: string | null;
  channel_name?: string | null;
  order_no?: string | null;
  order_number?: string | null;
  order_type?: string | null;
  pickup_type?: string | null;
  pickup_time?: string | null;
  order_status?: string | null;
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
  archived?: boolean;
  created_at?: string;
  updated_at?: string;
  items?: ApiOrderItem[];
  mock_notification?: string;
  latest_payment?: LatestPaymentSummary | null;
};

export type DashboardQueueStatus =
  | "pending_payment"
  | "waiting_payment_review"
  | "accepted"
  | "preparing"
  | "ready"
  | "ready_for_pickup"
  | "completed"
  | "cancelled";

export type DashboardRecentOrder = {
  order_id?: string | null;
  order_no?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  status?: string | null;
  order_status?: string | null;
  payment_status?: string | null;
  total_amount?: number | null;
  created_at?: string | null;
  latest_payment?: LatestPaymentSummary | null;
};

export type DashboardTrendPoint = {
  date: string;
  sales_amount: number;
  cost_amount: number;
  profit_amount: number;
  order_count: number;
};

export type DashboardRevenueRange = "all" | "today" | "last_7_days" | "last_30_days" | "this_month" | "custom";

export type DashboardRevenueFilterPayload = {
  revenueRange?: DashboardRevenueRange;
  startDate?: string;
  endDate?: string;
};

export type DashboardRevenueKpi = {
  range: DashboardRevenueRange;
  range_label: string;
  start_date?: string | null;
  end_date?: string | null;
  all_time: boolean;
  timezone: string;
  generated_at: string;
  total_sales_amount: number;
  total_sales_order_count: number;
  paid_sales_amount: number;
  paid_sales_order_count: number;
  pending_sales_amount: number;
  pending_sales_order_count: number;
  excluded_cancelled_order_count: number;
};

export type DashboardSummaryResponse = {
  store_id: string;
  store_timezone?: string | null;
  store_timezone_offset?: string | null;
  store_timezone_display?: string | null;
  today_orders_count: number;
  confirmed_revenue_today: number;
  pending_revenue_today: number;
  pending_payment_review_count: number;
  pending_payment_review_value: number;
  today_cost_amount: number;
  today_profit_amount: number;
  today_completed_orders_count: number;
  today_cancelled_orders_count: number;
  paid_orders_count: number;
  active_orders_count: number;
  completed_orders_count: number;
  queues: Record<DashboardQueueStatus | string, number>;
  recent_orders: DashboardRecentOrder[];
  seven_day_trend: DashboardTrendPoint[];
  dashboard_revenue_kpi?: DashboardRevenueKpi;
};

// ─── Planning: Overhead expenses & assumptions ─────────────────────────────
export const OVERHEAD_CATEGORIES = [
  "rent",
  "water",
  "electricity",
  "internet",
  "labor",
  "equipment",
  "transport",
  "marketing",
  "other",
] as const;
export type OverheadCategory = (typeof OVERHEAD_CATEGORIES)[number];

export const OVERHEAD_PERIODS = ["daily", "weekly", "monthly"] as const;
export type OverheadPeriod = (typeof OVERHEAD_PERIODS)[number];

export type OverheadExpense = {
  id: string;
  store_id?: string;
  name: string;
  category: OverheadCategory;
  amount: number;
  period: OverheadPeriod;
  is_active: boolean;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type OverheadExpensePayload = {
  name: string;
  category: OverheadCategory;
  amount: number;
  period: OverheadPeriod;
  is_active?: boolean;
  note?: string | null;
};

export type OverheadExpenseUpdatePayload = Partial<OverheadExpensePayload>;

export type PlanningAssumptions = {
  expected_cups_per_month: number;
  operating_days_per_month: number;
  target_profit_monthly: number;
  overhead_allocation_method: "per_cup";
  store_id?: string;
};

export type PlanningAssumptionsPayload = {
  expected_cups_per_month?: number;
  operating_days_per_month?: number;
  target_profit_monthly?: number;
  overhead_allocation_method?: "per_cup";
};

export type PlanningBaselineOverhead = {
  monthly_overhead: number;
  expected_cups_per_month: number;
  operating_days_per_month: number;
  overhead_per_cup: number;
  break_even_cups_per_month: number | null;
  break_even_cups_per_day: number | null;
  allocation_method: "per_cup";
  expense_count: number;
  target_profit_monthly: number;
  category_breakdown?: Record<string, number>;
};

export type PlanningBaselineIngredientLine = {
  ingredient_id?: string | null;
  name?: string | null;
  quantity_used?: number | null;
  unit?: string | null;
  cost_per_unit?: number | null;
  line_cost?: number | null;
  cost_type?: string | null;
  cost_source?: string | null;
  is_active?: boolean | null;
  issues?: string[] | null;
};

export type PlanningBaselineAddon = {
  addon_id?: string | null;
  name?: string | null;
  price_delta?: number | null;
  current_unit_cost?: number | null;
  cost_status?: string | null;
};

export type PlanningBaselineItem = {
  product_id: string;
  name?: string | null;
  category?: string | null;
  is_active?: boolean;
  base_price: number;
  current_unit_cost: number;
  gross_profit?: number | null;
  gross_margin_percent?: number | null;
  cost_status?: string | null;
  recipe_complete?: boolean;
  ingredient_breakdown?: PlanningBaselineIngredientLine[];
  addons?: PlanningBaselineAddon[];
  historical_mix_percent?: number | null;
  has_addon_cost_gap?: boolean;
  addon_cost_status?: string | null;
  recipe_issue_codes?: string[];
  // Product-level overhead/profit overlay (planning overhead phase).
  direct_cost_per_unit?: number | null;
  gross_profit_per_unit?: number | null;
  overhead_per_unit?: number | null;
  net_profit_after_overhead_per_unit?: number | null;
};

export type PlanningBaselineWarningSummary = {
  missing_recipe_products: number;
  missing_ingredient_products: number;
  missing_ingredient_cost_products: number;
  zero_quantity_recipe_products: number;
  missing_addon_recipe_count: number;
  addon_cost_gap_products: number;
  manual_cost_ingredients_count: number;
  purchase_derived_ingredients_count: number;
};

export type PlanningBaselineResponse = {
  store: {
    id: string;
    name?: string | null;
    timezone?: string | null;
    timezone_display?: string | null;
    generated_at?: string | null;
  };
  baseline: {
    lookback_days: number;
    mix_source?: string | null;
    price_source?: string | null;
    cost_source?: string | null;
    overhead?: PlanningBaselineOverhead | null;
  };
  items: PlanningBaselineItem[];
  warnings: string[];
  warning_summary?: PlanningBaselineWarningSummary;
};

export type SalesReportSummary = {
  order_count: number;
  total_sales_confirmed: number;
  pending_revenue: number;
  total_cost: number;
  gross_profit: number;
  gross_margin_percent: number;
};

export type SalesReportOrderRow = {
  order_id: string;
  order_no?: string | null;
  channel_id?: string | null;
  channel_name?: string | null;
  status?: string | null;
  payment_status?: string | null;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
  created_at?: string | null;
};

export type SalesReportItemRow = {
  order_id: string;
  product_id?: string | null;
  product_name?: string | null;
  quantity: number;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
  channel_id?: string | null;
  channel_name?: string | null;
};

export type SalesReportChannelRow = {
  channel_id?: string | null;
  channel_name?: string | null;
  orders: number;
  sales_confirmed: number;
  pending_revenue: number;
  gross_profit: number;
};

export type SalesReportProductRow = {
  product_id?: string | null;
  product_name?: string | null;
  quantity: number;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
};

export type SalesReportFiltersResponse = {
  channels: { id: string; name: string }[];
  products: { id: string; name: string }[];
  applied: {
    channel_id?: string | null;
    product_id?: string | null;
  };
};

export type SalesReportResponse = {
  store_id: string;
  range: {
    start: string;
    end: string;
    timezone: string;
  };
  summary: SalesReportSummary;
  orders: SalesReportOrderRow[];
  order_items: SalesReportItemRow[];
  channels: SalesReportChannelRow[];
  products: SalesReportProductRow[];
  filters: SalesReportFiltersResponse;
};

export type SalesReportFiltersPayload = {
  start_date?: string;
  end_date?: string;
  channel_id?: string | null;
  product_id?: string | null;
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
  cancelled_reason?: string;
  cancelled_at?: string;
};

export type OrderCancelPayload = {
  reason?: string;
};

export type OrderItemPayload = {
  product_id: string;
  quantity: number;
  options?: Record<string, unknown>;
};

export type KioskOrderAddonSelection = {
  addon_id: string;
  quantity: number;
};

export type KioskOrderItemOptions = {
  sweetness?: number;
  addons?: KioskOrderAddonSelection[];
  note?: string;
};

export type KioskOrderItemPayload = {
  product_id: string;
  quantity: number;
  options?: KioskOrderItemOptions | null;
};

export type KioskOrderCustomerPayload = {
  name?: string | null;
  phone?: string | null;
};

export type KioskOrderPayload = {
  items: KioskOrderItemPayload[];
  payment_method: "promptpay" | "cash";
  customer?: KioskOrderCustomerPayload | null;
  note?: string | null;
};

export type ApiPayment = {
  id: string;
  store_id: string;
  order_id: string;
  order_no?: string | null;
  order_status?: string | null;
  order_payment_status?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
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
  slip_submitted?: boolean | null;
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

export type StorePaymentSettings = {
  store_id: string;
  promptpay_display_name: string | null;
  is_promptpay_enabled: boolean;
  is_cash_enabled: boolean;
  promptpay_qr_storage_path: string | null;
  promptpay_qr_file_name: string | null;
  promptpay_qr_url: string | null;
};

export type StorePaymentSettingsResponse = {
  store_id: string;
  settings: StorePaymentSettings;
};

export type StorePaymentSettingsUpdatePayload = {
  promptpay_display_name?: string | null;
  is_promptpay_enabled?: boolean;
  is_cash_enabled?: boolean;
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

type CsvDownload = { blob: Blob; filename?: string };

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("unauthorized");
  return token;
}

function parseFilename(disposition: string | null): string | undefined {
  if (!disposition) return undefined;
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }
  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1];
}

async function requestCsv(path: string): Promise<CsvDownload> {
  const token = await getAccessToken();
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/csv",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "request_failed");
    throw new Error(text || "request_failed");
  }
  const blob = await res.blob();
  return { blob, filename: parseFilename(res.headers.get("content-disposition")) };
}

function buildSalesReportQuery(filters: SalesReportFiltersPayload): string {
  const params = new URLSearchParams();
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  if (filters.channel_id) params.set("channel_id", filters.channel_id);
  if (filters.product_id) params.set("product_id", filters.product_id);
  return params.toString();
}

function buildDashboardSummaryQuery(filters?: DashboardRevenueFilterPayload): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.revenueRange) {
    params.set("revenue_range", filters.revenueRange);
  }
  if (filters.startDate) {
    params.set("start_date", filters.startDate);
  }
  if (filters.endDate) {
    params.set("end_date", filters.endDate);
  }
  return params.toString();
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

type StockIntakeListResponse = { items: StockIntake[]; store_id: string };

export const storeAdminApi = {
  async getMe(): Promise<{
    user_id: string;
    role: string;
    store_id?: string | null;
    store_name?: string | null;
    store_timezone?: string | null;
    store_currency?: string | null;
    memberships?: { store_id: string; role: string }[];
  }> {
    return request("/api/store-admin/me");
  },

  async getDashboardSummary(filters?: DashboardRevenueFilterPayload): Promise<DashboardSummaryResponse> {
    const search = buildDashboardSummaryQuery(filters);
    const path = `/api/store-admin/dashboard-summary${search ? `?${search}` : ""}`;
    return request(path);
  },

  async getPlanningBaseline(): Promise<PlanningBaselineResponse> {
    return request("/api/store-admin/planning/baseline");
  },

  // ─── Store Payment Settings ────────────────────────────────────────────────
  async getPaymentSettings(): Promise<StorePaymentSettingsResponse> {
    return request<StorePaymentSettingsResponse>("/api/store-admin/payment-settings");
  },

  async updatePaymentSettings(payload: StorePaymentSettingsUpdatePayload): Promise<StorePaymentSettingsResponse> {
    return request<StorePaymentSettingsResponse>("/api/store-admin/payment-settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  async uploadPaymentSettingsQr(file: File): Promise<StorePaymentSettingsResponse> {
    const token = await getAccessToken();
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BACKEND_BASE}/api/store-admin/payment-settings/qr`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      const reason = (body as any)?.detail || (body as any)?.error || res.statusText || "upload_failed";
      throw new Error(typeof reason === "string" ? reason : "upload_failed");
    }
    return body as StorePaymentSettingsResponse;
  },

  async deletePaymentSettingsQr(): Promise<StorePaymentSettingsResponse> {
    return request<StorePaymentSettingsResponse>("/api/store-admin/payment-settings/qr", {
      method: "DELETE",
    });
  },

  // ─── Planning: overhead expenses ──────────────────────────────────────────
  async listOverheadExpenses(): Promise<OverheadExpense[]> {
    const data = await request<{ items: OverheadExpense[] }>("/api/store-admin/planning/overhead-expenses");
    return data.items ?? [];
  },

  async createOverheadExpense(payload: OverheadExpensePayload): Promise<OverheadExpense> {
    return request<OverheadExpense>("/api/store-admin/planning/overhead-expenses", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateOverheadExpense(expenseId: string, payload: OverheadExpenseUpdatePayload): Promise<OverheadExpense> {
    return request<OverheadExpense>(`/api/store-admin/planning/overhead-expenses/${expenseId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  /** Soft delete — backend keeps the row and sets is_active=false (default DELETE). */
  async deactivateOverheadExpense(expenseId: string): Promise<OverheadExpense> {
    return request<OverheadExpense>(`/api/store-admin/planning/overhead-expenses/${expenseId}`, {
      method: "DELETE",
    });
  },

  /**
   * True hard delete — backend permanently removes the row (hard=true). Safe
   * because no other table references overhead_expenses and overhead is
   * recomputed live from the active rows on every planning request.
   */
  async deleteOverheadExpense(expenseId: string): Promise<{ status: string; id: string }> {
    return request<{ status: string; id: string }>(
      `/api/store-admin/planning/overhead-expenses/${expenseId}?hard=true`,
      { method: "DELETE" },
    );
  },

  // ─── Planning: assumptions ────────────────────────────────────────────────
  async getPlanningAssumptions(): Promise<PlanningAssumptions> {
    return request<PlanningAssumptions>("/api/store-admin/planning/assumptions");
  },

  async updatePlanningAssumptions(payload: PlanningAssumptionsPayload): Promise<PlanningAssumptions> {
    return request<PlanningAssumptions>("/api/store-admin/planning/assumptions", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async getSalesReport(filters: SalesReportFiltersPayload): Promise<SalesReportResponse> {
    const search = buildSalesReportQuery(filters);
    const path = `/api/store-admin/reports/sales${search ? `?${search}` : ""}`;
    return request(path);
  },

  async exportSalesReportCsv(filters: SalesReportFiltersPayload): Promise<CsvDownload> {
    const search = buildSalesReportQuery(filters);
    const path = `/api/store-admin/reports/sales/export${search ? `?${search}` : ""}`;
    return requestCsv(path);
  },

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

  async uploadProductImage(productId: string, file: File): Promise<ApiProduct> {
    const token = await getAccessToken();
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BACKEND_BASE}/api/store-admin/products/${productId}/image`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      const reason = (body as any)?.detail || res.statusText || "upload_failed";
      throw new Error(typeof reason === "string" ? reason : "upload_failed");
    }
    return body.product as ApiProduct;
  },

  async getProductOptions(productId: string): Promise<ProductOptionsResponse> {
    return request(`/api/store-admin/products/${productId}/options`);
  },

  async updateProductOptions(productId: string, payload: ProductOptionsPayload): Promise<ProductOptionsResponse> {
    return request<ProductOptionsResponse>(`/api/store-admin/products/${productId}/options`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async listProductAddons(productId: string): Promise<ApiProductAddon[]> {
    const data = await request<{ items: ApiProductAddon[] }>(`/api/store-admin/products/${productId}/addons`);
    return data.items ?? [];
  },

  async createProductAddon(productId: string, payload: ProductAddonPayload): Promise<ApiProductAddon> {
    return request<ApiProductAddon>(`/api/store-admin/products/${productId}/addons`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateProductAddon(addonId: string, payload: ProductAddonUpdatePayload): Promise<ApiProductAddon> {
    return request<ApiProductAddon>(`/api/store-admin/addons/${addonId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deactivateProductAddon(addonId: string): Promise<{ status: string }> {
    return request<{ status: string }>(`/api/store-admin/addons/${addonId}`, { method: "DELETE" });
  },

  async listAddonRecipes(addonId: string): Promise<{ items: ApiProductAddonRecipe[]; unit_cost?: number }> {
    return request(`/api/store-admin/addons/${addonId}/recipes`);
  },

  async createAddonRecipe(addonId: string, payload: ProductAddonRecipePayload): Promise<ApiProductAddonRecipe> {
    return request<ApiProductAddonRecipe>(`/api/store-admin/addons/${addonId}/recipes`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateAddonRecipe(recipeId: string, payload: ProductAddonRecipeUpdatePayload): Promise<ApiProductAddonRecipe> {
    return request<ApiProductAddonRecipe>(`/api/store-admin/addon-recipes/${recipeId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deleteAddonRecipe(recipeId: string): Promise<{ status: string }> {
    return request<{ status: string }>(`/api/store-admin/addon-recipes/${recipeId}`, { method: "DELETE" });
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

  async listStockIntakes(params?: { ingredient_id?: string; limit?: number }): Promise<StockIntake[]> {
    const search = new URLSearchParams();
    if (params?.ingredient_id) search.set("ingredient_id", params.ingredient_id);
    if (params?.limit) search.set("limit", String(params.limit));
    const path = `/api/store-admin/stock-intakes${search.size ? `?${search.toString()}` : ""}`;
    const data = await request<StockIntakeListResponse>(path);
    return data.items ?? [];
  },

  async getStockIntake(id: string): Promise<StockIntakeResponse> {
    return request<StockIntakeResponse>(`/api/store-admin/stock-intakes/${id}`);
  },

  async createStockIntake(payload: CreateStockIntakePayload): Promise<StockIntakeResponse> {
    return request<StockIntakeResponse>(`/api/store-admin/stock-intakes`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async uploadStockIntakeReceipt(intakeId: string, file: File, storeId: string): Promise<StockIntake> {
    const token = await getAccessToken();
    const formData = new FormData();
    formData.append("file", file);

    const search = new URLSearchParams();
    if (storeId) search.set("store_id", storeId);
    const path = `/api/store-admin/stock-intakes/${intakeId}/receipt${search.size ? `?${search}` : ""}`;

    const res = await fetch(`${BACKEND_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = (body as any)?.detail || (body as any)?.error || res.statusText;
      throw new Error(typeof reason === "string" ? reason : "receipt_upload_failed");
    }
    return body as StockIntake;
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

  async exportOrdersCsv(): Promise<CsvDownload> {
    return requestCsv("/api/store-admin/orders/export");
  },

  async getOrder(id: string): Promise<ApiOrder> {
    return request<ApiOrder>(`/api/store-admin/orders/${id}`);
  },

  async createOrder(payload: OrderPayload): Promise<{ id: string; status: string }> {
    return request<{ id: string; status: string }>("/api/store-admin/orders", { method: "POST", body: JSON.stringify(payload) });
  },

  async createKioskOrder(payload: KioskOrderPayload): Promise<ApiOrder> {
    return request<ApiOrder>("/api/store-admin/kiosk/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
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

  async exportPaymentsCsv(): Promise<CsvDownload> {
    return requestCsv("/api/store-admin/payments/export");
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
