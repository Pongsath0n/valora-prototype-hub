import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import DataTable from "@/components/shared/DataTable";
import FormField from "@/components/shared/FormField";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import { storeAdminApi, type ApiRecipe, type ApiProduct, type ApiIngredient, type RecipePayload } from "@/services/storeAdminApi";

type FormState = {
  id?: string;
  productId: string;
  ingredientId: string;
  quantityUsed: string;
};

const emptyForm: FormState = { productId: "", ingredientId: "", quantityUsed: "0" };

export default function StoreAdminRecipesPage() {
  const [recipes, setRecipes] = useState<ApiRecipe[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [ingredients, setIngredients] = useState<ApiIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const valid = useMemo(() => form.productId && form.ingredientId && Number(form.quantityUsed) >= 0, [form]);

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

    try {
      if (form.id) {
        await storeAdminApi.updateRecipe(form.id, payload);
        setInfo("อัปเดตสูตรแล้ว");
      } else {
        await storeAdminApi.createRecipe(payload);
        setInfo("เพิ่มสูตรแล้ว");
      }
      setForm(emptyForm);
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
    void refresh();
  };

  return (
    <AdminLayout title="สูตรและต้นทุน" subtitle="คำนวณต้นทุนจากวัตถุดิบต่อเมนู">
      <div className="stat-card space-y-3 mb-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title text-base">{form.id ? "แก้ไขสูตร" : "เพิ่มสูตร"}</h2>
          {refreshing ? <div className="flex items-center gap-1 text-xs text-muted-foreground"><RefreshCw className="w-3 h-3 animate-spin" /> กำลังโหลด</div> : null}
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <FormField label="เมนู">
            <select className="form-input" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              <option value="">-- เลือกเมนู --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="วัตถุดิบ">
            <select className="form-input" value={form.ingredientId} onChange={(e) => setForm({ ...form, ingredientId: e.target.value })}>
              <option value="">-- เลือกวัตถุดิบ --</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="ปริมาณที่ใช้">
            <input
              type="number"
              className="form-input"
              min={0}
              value={form.quantityUsed}
              onChange={(e) => setForm({ ...form, quantityUsed: e.target.value })}
            />
          </FormField>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
        <div className="flex gap-2">
          <button type="button" className="bg-primary text-primary-foreground px-4 py-2 rounded" onClick={handleSubmit}>
            {form.id ? "บันทึกการแก้ไข" : "เพิ่มสูตร"}
          </button>
          {form.id ? (
            <button type="button" className="px-4 py-2 rounded border" onClick={() => setForm(emptyForm)}>
              ยกเลิก
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : recipes.length === 0 ? (
        <EmptyState title="ยังไม่มีสูตร" description="เพิ่มสูตรวัตถุดิบต่อเมนู" />
      ) : (
        <DataTable
          columns={[
            { key: "product_name", header: "เมนู", render: (r) => r.product_name || r.product_id },
            { key: "ingredient_name", header: "วัตถุดิบ", render: (r) => r.ingredient_name || r.ingredient_id },
            { key: "quantity_used", header: "ปริมาณที่ใช้" },
            {
              key: "line_cost",
              header: "ต้นทุนบรรทัด",
              render: (r) => (typeof r.line_cost === "number" ? `฿${r.line_cost.toFixed(4)}` : "-")
            },
            {
              key: "actions",
              header: "จัดการ",
              render: (r) => (
                <div className="flex gap-2 text-sm">
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      setForm({
                        id: r.id,
                        productId: r.product_id,
                        ingredientId: r.ingredient_id,
                        quantityUsed: String(r.quantity_used),
                      })
                    }
                  >
                    แก้ไข
                  </button>
                  <button type="button" className="underline" onClick={() => handleDelete(r.id)}>
                    ลบ
                  </button>
                </div>
              ),
            },
          ]}
          rows={recipes}
        />
      )}
    </AdminLayout>
  );
}
