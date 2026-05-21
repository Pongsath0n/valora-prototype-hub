import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import DataTable from "@/components/shared/DataTable";
import FormField from "@/components/shared/FormField";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";
import { storeAdminApi, type ApiIngredient, type IngredientPayload } from "@/services/storeAdminApi";

type FormState = {
  id?: string;
  name: string;
  unit: string;
  costPerUnit: string;
  currentStock: string;
  lowStockThreshold: string;
  supplierName: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  name: "",
  unit: "",
  costPerUnit: "0",
  currentStock: "0",
  lowStockThreshold: "0",
  supplierName: "",
  isActive: true,
};

export default function StoreAdminIngredientsPage() {
  const [rows, setRows] = useState<ApiIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const valid = useMemo(() => form.name.trim() && form.unit.trim() && Number(form.costPerUnit) >= 0 && Number(form.currentStock) >= 0 && Number(form.lowStockThreshold) >= 0, [form]);

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      const res = await storeAdminApi.listIngredients();
      setRows(res.items ?? []);
    } catch (err: any) {
      setError(err?.message || "โหลดวัตถุดิบไม่สำเร็จ");
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
      setError("กรุณากรอกข้อมูลวัตถุดิบให้ครบและตัวเลขต้องไม่ติดลบ");
      return;
    }

    const payload: IngredientPayload = {
      name: form.name.trim(),
      unit: form.unit.trim(),
      cost_per_unit: Number(form.costPerUnit),
      current_stock: Number(form.currentStock),
      low_stock_threshold: Number(form.lowStockThreshold),
      supplier_name: form.supplierName || undefined,
      is_active: form.isActive,
    };

    try {
      if (form.id) {
        await storeAdminApi.updateIngredient(form.id, payload);
        setInfo("อัปเดตวัตถุดิบแล้ว");
      } else {
        await storeAdminApi.createIngredient(payload);
        setInfo("เพิ่มวัตถุดิบแล้ว");
      }
      setForm(emptyForm);
      void refresh();
    } catch (err: any) {
      const reason = err?.message || "บันทึกไม่สำเร็จ";
      if (reason === "unauthorized" || reason === "missing_token") setError("ต้องเข้าสู่ระบบก่อนใช้งาน");
      else setError(reason);
    }
  };

  const handleDelete = async (id: string) => {
    setError("");
    try {
      const res = await storeAdminApi.deleteIngredient(id);
      if (res.status === "deactivated") setInfo("ปิดการใช้งานวัตถุดิบที่มีการใช้งานแล้ว");
      else setInfo("ลบวัตถุดิบแล้ว");
    } catch (err: any) {
      const msg = err?.message || "ลบไม่สำเร็จ";
      if (msg === "ingredient_has_history") setInfo("ไม่สามารถลบได้ มีการใช้งานในสูตร/สต็อก");
      else setError(msg);
    }
    void refresh();
  };

  return (
    <AdminLayout title="วัตถุดิบ" subtitle="จัดการข้อมูลวัตถุดิบ ต้นทุนต่อหน่วย และสถานะสต็อก">
      <div className="stat-card space-y-3 mb-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title text-base">{form.id ? "แก้ไขวัตถุดิบ" : "เพิ่มวัตถุดิบ"}</h2>
          {refreshing ? <div className="flex items-center gap-1 text-xs text-muted-foreground"><RefreshCw className="w-3 h-3 animate-spin" /> กำลังโหลด</div> : null}
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <FormField label="ชื่อวัตถุดิบ">
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="หน่วย">
            <input className="form-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="เช่น g, ml, ชิ้น" />
          </FormField>
          <FormField label="ต้นทุนต่อหน่วย (฿)">
            <input type="number" className="form-input" min={0} value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} />
          </FormField>
          <FormField label="สต็อกปัจจุบัน">
            <input type="number" className="form-input" min={0} value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} />
          </FormField>
          <FormField label="แจ้งเตือนต่ำกว่า">
            <input type="number" className="form-input" min={0} value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
          </FormField>
          <FormField label="ผู้จัดจำหน่าย (ถ้ามี)">
            <input className="form-input" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
          </FormField>
          <FormField label="สถานะ">
            <select className="form-input" value={form.isActive ? "active" : "inactive"} onChange={(e) => setForm({ ...form, isActive: e.target.value === "active" })}>
              <option value="active">เปิดใช้งาน</option>
              <option value="inactive">ปิดใช้งาน</option>
            </select>
          </FormField>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
        <div className="flex gap-2">
          <button type="button" className="bg-primary text-primary-foreground px-4 py-2 rounded" onClick={handleSubmit}>
            {form.id ? "บันทึกการแก้ไข" : "เพิ่มวัตถุดิบ"}
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
      ) : rows.length === 0 ? (
        <EmptyState title="ยังไม่มีวัตถุดิบ" description="เพิ่มวัตถุดิบเพื่อเริ่มต้น" />
      ) : (
        <DataTable
          columns={[
            { key: "name", header: "ชื่อ" },
            { key: "unit", header: "หน่วย" },
            { key: "cost_per_unit", header: "ต้นทุน/หน่วย", render: (r) => `฿${Number(r.cost_per_unit).toFixed(4)}` },
            { key: "current_stock", header: "สต็อก" },
            { key: "low_stock_threshold", header: "แจ้งเตือนต่ำกว่า" },
            { key: "supplier_name", header: "ผู้จัดจำหน่าย", render: (r) => r.supplier_name || "-" },
            { key: "is_active", header: "สถานะ", render: (r) => <StatusBadge label={(r.is_active ?? true) ? "active" : "inactive"} tone={(r.is_active ?? true) ? "success" : "warning"} /> },
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
                        name: r.name,
                        unit: r.unit,
                        costPerUnit: String(r.cost_per_unit),
                        currentStock: String(r.current_stock),
                        lowStockThreshold: String(r.low_stock_threshold),
                        supplierName: r.supplier_name || "",
                        isActive: r.is_active ?? true,
                      })
                    }
                  >
                    แก้ไข
                  </button>
                  <button type="button" className="underline" onClick={() => handleDelete(r.id)}>
                    ลบ/ปิดใช้งาน
                  </button>
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      )}
    </AdminLayout>
  );
}
