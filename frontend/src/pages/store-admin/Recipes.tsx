import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, RefreshCw, Trash2 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import DataTable from "@/components/shared/DataTable";
import EmptyState from "@/components/shared/EmptyState";
import FormField from "@/components/shared/FormField";
import LoadingState from "@/components/shared/LoadingState";
import StatusBadge, { type BadgeTone } from "@/components/shared/StatusBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { storeAdminApi, type ApiIngredient, type ApiProduct, type ApiRecipe, type RecipePayload } from "@/services/storeAdminApi";

type CostCategory = "ingredient" | "packaging" | "consumable" | "addon" | "utility" | "other";

const COST_CATEGORY_ORDER: CostCategory[] = ["ingredient", "packaging", "consumable", "addon", "utility", "other"];
const COST_CATEGORY_SUMMARY: CostCategory[] = ["ingredient", "packaging", "consumable", "addon"];

const COST_CATEGORY_METADATA: Record<CostCategory, { label: string; description: string }> = {
  ingredient: { label: "วัตถุดิบหลัก", description: "เมล็ดกาแฟ / นม / น้ำเชื่อม" },
  packaging: { label: "บรรจุภัณฑ์", description: "แก้ว ฝา สติ๊กเกอร์" },
  consumable: { label: "สิ้นเปลือง", description: "ผ้าเย็น สำลีก้าน ฯลฯ" },
  addon: { label: "ท็อปปิ้ง/เพิ่ม", description: "ช็อตเพิ่ม / add-on" },
  utility: { label: "สาธารณูปโภค", description: "ไฟฟ้า/น้ำ/แก๊ส" },
  other: { label: "อื่น ๆ", description: "ต้นทุนที่ยังไม่จัดหมวด" },
};

type FormState = {
  id?: string;
  productId: string;
  ingredientId: string;
  quantityUsed: string;
  unit: string;
};

const createEmptyForm = (productId = ""): FormState => ({
  id: undefined,
  productId,
  ingredientId: "",
  quantityUsed: "0",
  unit: "",
});

type RecipeStatus = { code: "complete" | "missing" | "zero" | "inactive"; label: string; tone: BadgeTone };

type ExtendedRecipeItem = ApiRecipe & { line_cost: number };

type ProductRecipeSummary = {
  product: ApiProduct;
  recipeItems: ExtendedRecipeItem[];
  breakdown: Record<CostCategory, { total: number; items: ExtendedRecipeItem[] }>;
  totalCost: number;
  profitPerCup: number;
  marginPercent: number | null;
  status: RecipeStatus;
  warnings: string[];
};

function normalizeCostCategory(value?: string | null): CostCategory {
  const normalized = (value ?? "").toLowerCase() as CostCategory;
  if (COST_CATEGORY_ORDER.includes(normalized)) return normalized;
  return "other";
}

function formatCurrency(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return "฿0.00";
  const formatted = Math.abs(value).toLocaleString("th-TH", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${value < 0 ? "-฿" : "฿"}${formatted}`;
}

function formatPercent(value: number | null | undefined, fractionDigits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(fractionDigits)}%`;
}

function formatQuantity(value: number): string {
  if (Number.isNaN(value)) return "0";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export default function StoreAdminRecipesPage() {
  const [recipes, setRecipes] = useState<ApiRecipe[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [ingredients, setIngredients] = useState<ApiIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<FormState>(createEmptyForm());
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const valid = useMemo(() => {
    const qty = Number(form.quantityUsed);
    return Boolean(form.productId && form.ingredientId && !Number.isNaN(qty) && qty >= 0);
  }, [form]);

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      const res = await storeAdminApi.listRecipes();
      setRecipes(res.items ?? []);
      setProducts(res.products ?? []);
      setIngredients(res.ingredients ?? []);
    } catch (err: any) {
      setError(err?.message || "โหลดสูตรไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!selectedProductId) return;
    const stillExists = products.some((product) => product.id === selectedProductId);
    if (!stillExists) {
      setSelectedProductId(null);
      setDrawerOpen(false);
      setForm(createEmptyForm());
    }
  }, [products, selectedProductId]);

  const ingredientsById = useMemo(() => {
    return ingredients.reduce<Record<string, ApiIngredient>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }, [ingredients]);

  const productSummaries = useMemo<ProductRecipeSummary[]>(() => {
    const grouped = new Map<string, ExtendedRecipeItem[]>();
    recipes.forEach((recipe) => {
      const ingredient = ingredientsById[recipe.ingredient_id];
      const costPerUnit = recipe.ingredient_cost_per_unit ?? ingredient?.cost_per_unit ?? 0;
      const quantity = Number(recipe.quantity_used ?? 0);
      const lineCost = quantity * costPerUnit;
      const enriched: ExtendedRecipeItem = {
        ...recipe,
        unit: recipe.unit ?? ingredient?.unit ?? recipe.ingredient_unit ?? undefined,
        ingredient_name: recipe.ingredient_name ?? ingredient?.name ?? recipe.ingredient_id,
        ingredient_unit: recipe.ingredient_unit ?? ingredient?.unit ?? recipe.unit ?? undefined,
        ingredient_cost_per_unit: costPerUnit,
        ingredient_cost_type: recipe.ingredient_cost_type ?? ingredient?.cost_type ?? null,
        ingredient_is_active: recipe.ingredient_is_active ?? ingredient?.is_active ?? true,
        line_cost: lineCost,
      };
      const items = grouped.get(recipe.product_id) ?? [];
      items.push(enriched);
      grouped.set(recipe.product_id, items);
    });

    return products.map((product) => {
      const items = (grouped.get(product.id) ?? []).sort((a, b) => (a.ingredient_name || "").localeCompare(b.ingredient_name || ""));
      const breakdown = COST_CATEGORY_ORDER.reduce<Record<CostCategory, { total: number; items: ExtendedRecipeItem[] }>>((acc, key) => {
        acc[key] = { total: 0, items: [] };
        return acc;
      }, {} as Record<CostCategory, { total: number; items: ExtendedRecipeItem[] }>);

      let hasActiveLine = false;
      let hasInactiveLine = false;
      let zeroCostLine = false;

      items.forEach((item) => {
        const category = normalizeCostCategory(item.ingredient_cost_type);
        breakdown[category].items.push(item);
        breakdown[category].total += item.line_cost ?? 0;
        if (item.ingredient_is_active === false) hasInactiveLine = true;
        else hasActiveLine = true;
        if (!item.line_cost || item.line_cost <= 0) zeroCostLine = true;
      });

      const totalCost = COST_CATEGORY_ORDER.reduce((sum, key) => sum + breakdown[key].total, 0);
      const sellingPrice = Number(product.base_price ?? 0);
      const profitPerCup = sellingPrice - totalCost;
      const marginPercent = sellingPrice > 0 ? (profitPerCup / sellingPrice) * 100 : null;

      const warnings: string[] = [];
      if (hasInactiveLine) warnings.push("สูตรนี้มีวัตถุดิบที่ถูกปิดใช้งาน");
      if (zeroCostLine && items.length > 0) warnings.push("มีวัตถุดิบที่ต้นทุน 0 บาท");

      let status: RecipeStatus;
      if (items.length === 0) status = { code: "missing", label: "ยังไม่มีสูตร", tone: "warning" };
      else if (totalCost <= 0) status = { code: "zero", label: "ต้นทุนยังไม่ถูกตั้ง", tone: "warning" };
      else if (hasInactiveLine) status = { code: "inactive", label: "มีวัตถุดิบปิดใช้งาน", tone: "warning" };
      else if (hasActiveLine) status = { code: "complete", label: "สูตรครบถ้วน", tone: "success" };
      else status = { code: "zero", label: "ตรวจสอบสูตร", tone: "warning" };

      return { product, recipeItems: items, breakdown, totalCost, profitPerCup, marginPercent, status, warnings };
    });
  }, [ingredientsById, products, recipes]);

  const summaryStats = useMemo(() => {
    const total = productSummaries.length;
    const completed = productSummaries.filter((summary) => summary.status.code === "complete").length;
    const missing = productSummaries.filter((summary) => summary.status.code === "missing").length;
    const needsAttention = productSummaries.filter((summary) => summary.status.code !== "complete").length;
    return { total, completed, missing, needsAttention };
  }, [productSummaries]);

  const selectedSummary = useMemo(() => productSummaries.find((summary) => summary.product.id === selectedProductId), [productSummaries, selectedProductId]);

  const resetForm = (productId?: string) => setForm(createEmptyForm(productId ?? ""));

  const openRecipeDetail = (productId: string, options?: { reset?: boolean }) => {
    setSelectedProductId(productId);
    setDrawerOpen(true);
    if (options?.reset ?? true) {
      resetForm(productId);
    }
    setError("");
    setInfo("");
  };

  const handleSubmit = async () => {
    if (!valid) {
      setError("กรุณาเลือกเมนู/วัตถุดิบ และปริมาณต้องไม่ติดลบ");
      return;
    }

    const payload: RecipePayload = {
      product_id: form.productId,
      ingredient_id: form.ingredientId,
      quantity_used: Number(form.quantityUsed),
    };
    if (form.unit.trim()) payload.unit = form.unit.trim();

    try {
      if (form.id) {
        await storeAdminApi.updateRecipe(form.id, payload);
        setInfo("อัปเดตสูตรแล้ว");
      } else {
        await storeAdminApi.createRecipe(payload);
        setInfo("เพิ่มสูตรแล้ว");
      }
      resetForm(selectedProductId ?? form.productId);
      void refresh();
    } catch (err: any) {
      const reason = err?.message || "บันทึกไม่สำเร็จ";
      if (reason === "recipe_exists") setError("มีสูตรนี้แล้ว");
      else if (reason === "unauthorized" || reason === "missing_token") setError("ต้องเข้าสู่ระบบก่อนใช้งาน");
      else setError(reason);
    }
  };

  const handleDelete = async (id: string) => {
    setError("");
    try {
      const res = await storeAdminApi.deleteRecipe(id);
      setInfo(res.status === "deleted" ? "ลบสูตรแล้ว" : res.status);
    } catch (err: any) {
      setError(err?.message || "ลบไม่สำเร็จ");
    }
    resetForm(selectedProductId ?? undefined);
    void refresh();
  };

  const startEdit = (item: ExtendedRecipeItem) => {
    openRecipeDetail(item.product_id, { reset: false });
    setForm({
      id: item.id,
      productId: item.product_id,
      ingredientId: item.ingredient_id,
      quantityUsed: String(item.quantity_used),
      unit: item.unit ?? item.ingredient_unit ?? "",
    });
  };

  const selectedIngredient = ingredients.find((ingredient) => ingredient.id === form.ingredientId);

  const renderRecipeGroups = () => {
    if (!selectedSummary) return null;
    if (selectedSummary.recipeItems.length === 0) {
      return <EmptyState title="ยังไม่มีวัตถุดิบในสูตรนี้" description="เพิ่มวัตถุดิบแรกของเมนูเพื่อคำนวณต้นทุน" />;
    }

    return COST_CATEGORY_ORDER.map((category) => {
      const group = selectedSummary.breakdown[category];
      if (!group || group.items.length === 0) return null;
      const meta = COST_CATEGORY_METADATA[category];
      return (
        <div key={category} className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{meta.label}</p>
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            </div>
            <p className="text-sm font-semibold">{formatCurrency(group.total)}</p>
          </div>
          <div className="space-y-2">
            {group.items.map((item) => {
              const unitLabel = item.unit || item.ingredient_unit || "";
              return (
                <div key={item.id} className="border rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.ingredient_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatQuantity(Number(item.quantity_used))} {unitLabel} × {formatCurrency(item.ingredient_cost_per_unit ?? 0)} = {formatCurrency(item.line_cost ?? 0)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <button type="button" className="text-primary hover:underline" onClick={() => startEdit(item)}>
                        แก้ไข
                      </button>
                      <button type="button" className="text-destructive inline-flex items-center gap-1" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="w-4 h-4" /> ลบ
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {item.ingredient_is_active === false ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">ปิดใช้งาน</span> : null}
                    {(!item.ingredient_cost_per_unit || item.ingredient_cost_per_unit === 0) ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">ต้นทุน 0 บาท</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  };

  return (
    <AdminLayout title="สูตรและต้นทุน" subtitle="มองภาพรวมต้นทุนต่อเมนูแบบ 1 เมนู = 1 สูตร">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-sm text-muted-foreground">ควบคุมต้นทุนต่อแก้วให้ชัดเจน เห็นสถานะของแต่ละเมนูในครั้งเดียว</p>
          {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
          {info ? <p className="text-sm text-emerald-600 mt-2">{info}</p> : null}
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-card shadow-sm text-sm"
          onClick={() => void refresh()}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          รีเฟรชข้อมูล
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4 mb-6">
        <div className="stat-card">
          <p className="metric-label">เมนูทั้งหมด</p>
          <p className="metric-value">{summaryStats.total}</p>
        </div>
        <div className="stat-card">
          <p className="metric-label">สูตรครบถ้วน</p>
          <p className="metric-value text-emerald-600">{summaryStats.completed}</p>
        </div>
        <div className="stat-card">
          <p className="metric-label">ยังไม่มีสูตร</p>
          <p className="metric-value text-amber-600">{summaryStats.missing}</p>
        </div>
        <div className="stat-card">
          <p className="metric-label">ต้องตรวจสอบ</p>
          <p className="metric-value text-red-600">{summaryStats.needsAttention}</p>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : products.length === 0 ? (
        <EmptyState title="ยังไม่มีเมนู" description="เพิ่มเมนูใหม่ก่อนตั้งสูตร" />
      ) : (
        <DataTable
          columns={[
            {
              key: "menu",
              header: "เมนู",
              className: "min-w-[180px]",
              render: (row: ProductRecipeSummary) => (
                <div>
                  <p className="font-medium">{row.product.name}</p>
                  <p className="text-xs text-muted-foreground">สูตร {row.recipeItems.length ? `${row.recipeItems.length} รายการ` : "ยังไม่ถูกตั้ง"}</p>
                </div>
              ),
            },
            {
              key: "selling_price",
              header: "ราคาขาย",
              render: (row: ProductRecipeSummary) => formatCurrency(Number(row.product.base_price ?? 0)),
            },
            {
              key: "cost_per_cup",
              header: "ต้นทุน/แก้ว",
              render: (row: ProductRecipeSummary) => formatCurrency(row.totalCost),
            },
            {
              key: "profit_per_cup",
              header: "กำไร/แก้ว",
              render: (row: ProductRecipeSummary) => formatCurrency(row.profitPerCup),
            },
            {
              key: "margin",
              header: "มาร์จิ้น",
              render: (row: ProductRecipeSummary) => formatPercent(row.marginPercent),
            },
            {
              key: "status",
              header: "สถานะสูตร",
              render: (row: ProductRecipeSummary) => <StatusBadge label={row.status.label} tone={row.status.tone} />,
            },
            {
              key: "actions",
              header: "จัดการ",
              render: (row: ProductRecipeSummary) => (
                <button type="button" className="text-primary font-medium hover:underline" onClick={() => openRecipeDetail(row.product.id)}>
                  ดู/แก้ไขสูตร
                </button>
              ),
            },
          ]}
          rows={productSummaries}
        />
      )}

      <Sheet
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setSelectedProductId(null);
            resetForm();
            setError("");
            setInfo("");
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          {selectedSummary ? (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="text-2xl">{selectedSummary.product.name}</SheetTitle>
                <p className="text-sm text-muted-foreground">1 เมนู = 1 สูตร • แก้ไขวัตถุดิบของเมนูนี้ได้จากที่เดียว</p>
              </SheetHeader>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="stat-card">
                  <p className="text-sm text-muted-foreground">ราคาขาย</p>
                  <p className="text-2xl font-semibold">{formatCurrency(Number(selectedSummary.product.base_price ?? 0))}</p>
                </div>
                <div className="stat-card">
                  <p className="text-sm text-muted-foreground">สถานะสูตร</p>
                  <div className="flex items-center gap-2">
                    <StatusBadge label={selectedSummary.status.label} tone={selectedSummary.status.tone} />
                    {selectedSummary.warnings.length > 0 ? <span className="text-xs text-amber-600">{selectedSummary.warnings.length} คำเตือน</span> : null}
                  </div>
                </div>
                <div className="stat-card">
                  <p className="text-sm text-muted-foreground">ต้นทุนต่อแก้ว</p>
                  <p className="text-2xl font-semibold">{formatCurrency(selectedSummary.totalCost)}</p>
                </div>
                <div className="stat-card">
                  <p className="text-sm text-muted-foreground">กำไร / มาร์จิ้น</p>
                  <p className="text-2xl font-semibold">{formatCurrency(selectedSummary.profitPerCup)}</p>
                  <p className="text-sm text-muted-foreground">{formatPercent(selectedSummary.marginPercent)}</p>
                </div>
              </div>

              {selectedSummary.warnings.length ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 text-sm space-y-1">
                  {selectedSummary.warnings.map((warning) => (
                    <div key={warning} className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                {COST_CATEGORY_SUMMARY.map((category) => {
                  const meta = COST_CATEGORY_METADATA[category];
                  const total = selectedSummary.breakdown[category]?.total ?? 0;
                  return (
                    <div key={category} className="stat-card">
                      <p className="text-sm text-muted-foreground">{meta.label}</p>
                      <p className="text-lg font-semibold">{formatCurrency(total)}</p>
                    </div>
                  );
                })}
              </div>

              <div className="stat-card space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="section-title text-base">{form.id ? "แก้ไขวัตถุดิบในสูตร" : "เพิ่มวัตถุดิบในสูตร"}</h3>
                  {refreshing ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <RefreshCw className="w-3 h-3 animate-spin" /> กำลังโหลด
                    </div>
                  ) : null}
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <FormField label="วัตถุดิบ">
                    <select
                      className="form-input"
                      value={form.ingredientId}
                      onChange={(event) => {
                        const ingredientId = event.target.value;
                        const ingredient = ingredients.find((item) => item.id === ingredientId);
                        setForm({ ...form, ingredientId, unit: ingredient?.unit ?? form.unit });
                      }}
                    >
                      <option value="">-- เลือกวัตถุดิบ --</option>
                      {ingredients.map((ingredient) => (
                        <option key={ingredient.id} value={ingredient.id}>
                          {ingredient.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="ปริมาณที่ใช้">
                    <input
                      type="number"
                      min={0}
                      className="form-input"
                      value={form.quantityUsed}
                      onChange={(event) => setForm({ ...form, quantityUsed: event.target.value })}
                    />
                  </FormField>
                  <FormField label="หน่วย (ถ้ามี)">
                    <input
                      className="form-input"
                      placeholder={selectedIngredient?.unit || "เช่น ml, g, ชิ้น"}
                      value={form.unit}
                      onChange={(event) => setForm({ ...form, unit: event.target.value })}
                    />
                  </FormField>
                </div>
                {selectedIngredient ? (
                  <p className="text-xs text-muted-foreground">ต้นทุนต่อหน่วย: {formatCurrency(selectedIngredient.cost_per_unit, 4)} / {selectedIngredient.unit}</p>
                ) : null}
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                {info ? <p className="text-sm text-emerald-600">{info}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded"
                    onClick={handleSubmit}
                  >
                    <Plus className="w-4 h-4" />
                    {form.id ? "บันทึกการแก้ไข" : "เพิ่มวัตถุดิบ"}
                  </button>
                  {form.id ? (
                    <button type="button" className="px-4 py-2 rounded border" onClick={() => resetForm(selectedProductId ?? undefined)}>
                      ยกเลิก
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="section-title text-base">รายละเอียดต้นทุนตามหมวด</h3>
                {renderRecipeGroups()}
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">เลือกเมนูจากตารางเพื่อดูรายละเอียดสูตร</div>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
