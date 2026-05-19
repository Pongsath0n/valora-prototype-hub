import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";
import FormField from "@/components/shared/FormField";
import StatusBadge from "@/components/shared/StatusBadge";
import { menuCatalogService, type MenuItem } from "@/features/store/catalogService";
import { supabase } from "@/lib/supabase";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const emptyForm = { id: "", name: "", category: "Coffee", basePrice: "", imageUrl: "" };

export default function MenuManagement() {
  const [rows, setRows] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const valid = useMemo(() => form.name.trim().length > 1 && Number(form.basePrice) >= 0, [form]);

  async function refresh() {
    setLoading(true); setError("");
    try { setRows(await menuCatalogService.list()); } catch { setError("โหลดเมนูไม่สำเร็จ"); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  async function uploadImage(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("รองรับเฉพาะไฟล์ jpg, jpeg, png, webp");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("ขนาดไฟล์ต้องไม่เกิน 5MB");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const filePath = `menu/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("menu-images").upload(filePath, file, {
        upsert: false,
        contentType: file.type,
      });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("menu-images").getPublicUrl(filePath);
      if (!data?.publicUrl) throw new Error("ไม่สามารถสร้าง public URL ได้");
      setForm((prev) => ({ ...prev, imageUrl: data.publicUrl }));
    } catch (e: any) {
      setError(`อัปโหลดรูปไม่สำเร็จ: ${e?.message ?? "unknown error"}`);
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!valid) return setError("กรุณากรอกชื่อเมนูและราคาขายให้ถูกต้อง");
    await menuCatalogService.upsert({ id: form.id || undefined, name: form.name.trim(), category: form.category, basePrice: Number(form.basePrice), imageUrl: form.imageUrl || null });
    setForm(emptyForm);
    refresh();
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="page-title">จัดการเมนู</h1>
        <div className="stat-card grid md:grid-cols-2 gap-3">
          <FormField label="ชื่อเมนู"><input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField label="หมวดหมู่"><input className="form-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></FormField>
          <FormField label="ราคาขายพื้นฐาน (฿)"><input type="number" className="form-input" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} /></FormField>

          <FormField label="รูปภาพเมนู (jpg/jpeg/png/webp ไม่เกิน 5MB)">
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="form-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadImage(file);
              }}
              disabled={uploading}
            />
            {uploading ? <p className="text-xs text-muted-foreground mt-1">กำลังอัปโหลดรูป...</p> : null}
          </FormField>

          <div className="md:col-span-2">
            {(form.imageUrl || form.id) ? (
              <div className="border rounded-lg p-3 inline-block">
                <p className="text-xs text-muted-foreground mb-2">ตัวอย่างรูปภาพ</p>
                <img src={form.imageUrl || rows.find((r) => r.id === form.id)?.imageUrl || ""} alt="menu preview" className="w-40 h-40 object-cover rounded" />
              </div>
            ) : null}
          </div>

          <div className="md:col-span-2 flex gap-2">
            <button className="bg-primary text-primary-foreground px-4 py-2 rounded disabled:opacity-60" onClick={submit} disabled={uploading}>{form.id ? "บันทึกการแก้ไข" : "เพิ่มเมนู"}</button>
            {form.id ? <button className="px-4 py-2 rounded border" onClick={() => setForm(emptyForm)}>ยกเลิก</button> : null}
          </div>
          {error ? <p className="md:col-span-2 text-sm text-red-600">{error}</p> : null}
        </div>

        {loading ? <LoadingState /> : rows.length === 0 ? <EmptyState title="ยังไม่มีเมนู" description="เพิ่มเมนูแรกเพื่อเริ่มต้น" /> : (
          <DataTable
            columns={[
              { key: "name", header: "เมนู", render: (r) => <button className="underline" onClick={() => setForm({ id: r.id, name: r.name, category: r.category, basePrice: String(r.basePrice), imageUrl: r.imageUrl || "" })}>{r.name}</button> },
              { key: "imageUrl", header: "รูป", render: (r) => r.imageUrl ? <img src={r.imageUrl} alt={r.name} className="w-10 h-10 rounded object-cover" /> : <span className="text-xs text-muted-foreground">ไม่มีรูป</span> },
              { key: "category", header: "หมวดหมู่" },
              { key: "basePrice", header: "ราคา" },
              { key: "isActive", header: "สถานะ", render: (r) => <StatusBadge label={r.isActive ? "active" : "inactive"} tone={r.isActive ? "success" : "warning"} /> },
              { key: "act", header: "จัดการ", render: (r) => <button className="text-sm" onClick={() => menuCatalogService.setActive(r.id, !r.isActive).then(refresh)}>{r.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button> },
            ]}
            rows={rows}
          />
        )}
      </div>
    </AppLayout>
  );
}
