import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import DataTable from "@/components/shared/DataTable";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";
import FormField from "@/components/shared/FormField";
import StatusBadge from "@/components/shared/StatusBadge";
import { menuCatalogService, type MenuItem } from "@/features/store/catalogService";

const emptyForm = { id: "", name: "", category: "Coffee", basePrice: "", imageUrl: "" };

export default function AdminProductsPage() {
  const [rows, setRows] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const valid = useMemo(
    () => form.name.trim().length > 1 && Number(form.basePrice) >= 0,
    [form],
  );

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setRows(await menuCatalogService.list());
    } catch {
      setError("โหลดเมนูไม่สำเร็จ");
    } finally {
      setLoading(false);
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
    await menuCatalogService.upsert({
      id: form.id || undefined,
      name: form.name.trim(),
      category: form.category,
      basePrice: Number(form.basePrice),
      imageUrl: form.imageUrl || null,
    });
    setForm(emptyForm);
    void refresh();
  }

  return (
    <AdminLayout title="เมนูสินค้า" subtitle="จัดการเมนู หมวดหมู่ และสถานะการเปิดใช้งาน">
      <div className="stat-card grid md:grid-cols-2 gap-3">
        <FormField label="ชื่อเมนู">
          <input
            className="form-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FormField>
        <FormField label="หมวดหมู่">
          <input
            className="form-input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
        </FormField>
        <FormField label="ราคาขายพื้นฐาน (฿)">
          <input
            type="number"
            className="form-input"
            value={form.basePrice}
            onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
          />
        </FormField>
        <FormField label="URL รูปภาพเมนู">
          <input
            className="form-input"
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="ใช้ URL ชั่วคราวก่อน Supabase Storage"
          />
        </FormField>
        <div className="md:col-span-2 flex gap-2">
          <button
            type="button"
            className="bg-primary text-primary-foreground px-4 py-2 rounded"
            onClick={submit}
          >
            {form.id ? "บันทึกการแก้ไข" : "เพิ่มเมนู"}
          </button>
          {form.id ? (
            <button
              type="button"
              className="px-4 py-2 rounded border"
              onClick={() => setForm(emptyForm)}
            >
              ยกเลิก
            </button>
          ) : null}
        </div>
        {error ? <p className="md:col-span-2 text-sm text-red-600">{error}</p> : null}
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
                      category: r.category,
                      basePrice: String(r.basePrice),
                      imageUrl: r.imageUrl || "",
                    })
                  }
                >
                  {r.name}
                </button>
              ),
            },
            { key: "category", header: "หมวดหมู่" },
            { key: "basePrice", header: "ราคา" },
            {
              key: "isActive",
              header: "สถานะ",
              render: (r) => (
                <StatusBadge
                  label={r.isActive ? "active" : "inactive"}
                  tone={r.isActive ? "success" : "warning"}
                />
              ),
            },
            {
              key: "act",
              header: "จัดการ",
              render: (r) => (
                <button
                  type="button"
                  className="text-sm"
                  onClick={() => menuCatalogService.setActive(r.id, !r.isActive).then(refresh)}
                >
                  {r.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                </button>
              ),
            },
          ]}
          rows={rows}
        />
      )}
    </AdminLayout>
  );
}
