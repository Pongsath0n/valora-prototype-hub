import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import DataTable from "@/components/shared/DataTable";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";
import FormField from "@/components/shared/FormField";
import StatusBadge from "@/components/shared/StatusBadge";
import { storeAdminApi, type ApiProduct, type ApiCategory, type ProductPayload } from "@/services/storeAdminApi";

type FormState = {
  id?: string;
  name: string;
  basePrice: string;
  categoryId: string;
  categoryName: string;
  isActive: boolean;
  isSpecial: boolean;
  imageUrl: string;
  description: string;
};

const emptyForm: FormState = {
  name: "",
  basePrice: "0",
  categoryId: "",
  categoryName: "",
  isActive: true,
  isSpecial: false,
  imageUrl: "",
  description: "",
};

export default function AdminProductsPage() {
  const [rows, setRows] = useState<ApiProduct[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const valid = useMemo(() => form.name.trim().length > 1 && Number(form.basePrice) >= 0, [form]);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const res = await storeAdminApi.listMenus();
      setRows(res.items ?? []);
      setCategories(res.categories ?? []);
    } catch (err: any) {
      setError(err?.message || "โหลดเมนูไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function submit() {
    if (!valid) {
      setError("กรุณากรอกชื่อเมนูและราคาขายให้ถูกต้อง");
      return;
    }

    const payload: ProductPayload = {
      name: form.name.trim(),
      base_price: Number(form.basePrice),
      category_id: form.categoryId || null,
      category_name: form.categoryId ? undefined : form.categoryName.trim() || undefined,
      is_active: form.isActive,
      is_special: form.isSpecial,
      image_url: form.imageUrl || undefined,
      description: form.description || undefined,
    };

    try {
      if (form.id) {
        await storeAdminApi.updateMenu(form.id, payload);
        setInfo("อัปเดตเมนูเรียบร้อย");
      } else {
        await storeAdminApi.createMenu(payload);
        setInfo("เพิ่มเมนูเรียบร้อย");
      }
      setForm(emptyForm);
      void refresh();
    } catch (err: any) {
      const reason = err?.message || "บันทึกไม่สำเร็จ";
      if (reason === "product_name_exists") setError("มีชื่อเมนูนี้แล้ว");
      else if (reason === "unauthorized" || reason === "missing_token") setError("ต้องเข้าสู่ระบบก่อนใช้งาน");
      else setError(reason);
    }
  }

  async function handleDelete(id: string) {
    setError("");
    try {
      const res = await storeAdminApi.deleteMenu(id);
      if (res.status === "deactivated") setInfo("ปิดการใช้งานเมนูที่มีประวัติแล้ว");
      else setInfo("ลบเมนูแล้ว");
    } catch (err: any) {
      const msg = err?.message || "ลบไม่สำเร็จ";
      if (msg === "product_has_history") setInfo("ไม่สามารถลบได้ มีประวัติการใช้งาน");
      else setError(msg);
    }
    void refresh();
  }

  const categoryOptions = [{ id: "", name: "-- ไม่ระบุหมวดหมู่ --" }, ...categories];

  return (
    <AdminLayout title="เมนูสินค้า" subtitle="จัดการเมนู หมวดหมู่ และสถานะการเปิดใช้งาน">
      <div className="stat-card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title text-base">{form.id ? "แก้ไขเมนู" : "เพิ่มเมนูใหม่"}</h2>
          {refreshing ? <div className="flex items-center gap-1 text-xs text-muted-foreground"><RefreshCw className="w-3 h-3 animate-spin" /> กำลังโหลด</div> : null}
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <FormField label="ชื่อเมนู">
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="หมวดหมู่ (เลือก)">
            <select
              className="form-input"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value, categoryName: "" })}
            >
              {categoryOptions.map((c) => (
                <option key={c.id || "none"} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="หรือสร้างหมวดใหม่">
            <input
              className="form-input"
              placeholder="ใส่ชื่อหมวดหมู่ใหม่"
              value={form.categoryName}
              onChange={(e) => setForm({ ...form, categoryName: e.target.value, categoryId: "" })}
            />
          </FormField>
          <FormField label="ราคาขายพื้นฐาน (฿)">
            <input
              type="number"
              className="form-input"
              min={0}
              value={form.basePrice}
              onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
            />
          </FormField>
          <FormField label="สถานะ">
            <select
              className="form-input"
              value={form.isActive ? "active" : "inactive"}
              onChange={(e) => setForm({ ...form, isActive: e.target.value === "active" })}
            >
              <option value="active">เปิดใช้งาน</option>
              <option value="inactive">ปิดใช้งาน</option>
            </select>
          </FormField>
          <FormField label="เมนูแนะนำ">
            <select
              className="form-input"
              value={form.isSpecial ? "yes" : "no"}
              onChange={(e) => setForm({ ...form, isSpecial: e.target.value === "yes" })}
            >
              <option value="no">ไม่ระบุ</option>
              <option value="yes">แนะนำ</option>
            </select>
          </FormField>
          <FormField label="URL รูปภาพเมนู">
            <input
              className="form-input"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              placeholder="ใช้ URL ชั่วคราวก่อน Supabase Storage"
            />
          </FormField>
          <FormField label="คำอธิบาย">
            <textarea
              className="form-input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </FormField>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
        <div className="flex gap-2">
          <button type="button" className="bg-primary text-primary-foreground px-4 py-2 rounded" onClick={submit}>
            {form.id ? "บันทึกการแก้ไข" : "เพิ่มเมนู"}
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
        <EmptyState title="ยังไม่มีเมนู" description="เพิ่มเมนูแรกเพื่อเริ่มต้น" />
      ) : (
        <DataTable
          columns={[
            {
              key: "name",
              header: "เมนู",
              render: (r) => (
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    setForm({
                      id: r.id,
                      name: r.name,
                      basePrice: String(r.base_price),
                      categoryId: r.category_id || "",
                      categoryName: r.category_name || "",
                      isActive: r.is_active ?? true,
                      isSpecial: r.is_special ?? false,
                      imageUrl: r.image_url || "",
                      description: r.description || "",
                    })
                  }
                >
                  {r.name}
                </button>
              ),
            },
            { key: "category_name", header: "หมวดหมู่", render: (r) => r.category_name || "-" },
            { key: "base_price", header: "ราคา", render: (r) => `฿${Number(r.base_price).toFixed(2)}` },
            {
              key: "is_active",
              header: "สถานะ",
              render: (r) => <StatusBadge label={(r.is_active ?? true) ? "active" : "inactive"} tone={(r.is_active ?? true) ? "success" : "warning"} />,
            },
            {
              key: "actions",
              header: "จัดการ",
              render: (r) => (
                <div className="flex gap-2 text-sm">
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
