import { useEffect, useMemo, useState } from "react";
import { Plus, Edit3, Trash2, Power } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";
import FormField from "@/components/shared/FormField";
import StatusBadge from "@/components/shared/StatusBadge";
import { orderService, type FeeType, type SalesChannel } from "@/features/store/orderService";

type FormState = { id?: string; name: string; feeType: FeeType; feeValue: string; isActive: boolean };
const emptyForm: FormState = { name: "", feeType: "none", feeValue: "0", isActive: true };

export default function SalesChannels() {
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string>("");

  const activeCount = useMemo(() => channels.filter((c) => c.isActive).length, [channels]);

  const refresh = () => setChannels(orderService.listChannels(true));
  useEffect(() => { refresh(); }, []);

  const handleSubmit = () => {
    setError("");
    try {
      orderService.upsertChannel({ id: form.id, name: form.name, feeType: form.feeType, feeValue: Number(form.feeValue || 0), isActive: form.isActive });
      setShowForm(false);
      setForm(emptyForm);
      refresh();
    } catch (err: any) { setError(err?.message || "บันทึกไม่สำเร็จ"); }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="page-title">ช่องทางการขาย</h1>
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded bg-accent text-accent-foreground text-sm" onClick={() => { setForm(emptyForm); setShowForm(true); }}>
            <Plus className="w-4 h-4" /> เพิ่มช่องทาง
          </button>
        </div>
        <p className="text-sm text-muted-foreground">ช่องทางที่เปิดใช้งาน: {activeCount}</p>

        {showForm ? (
          <div className="stat-card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="section-title text-base">{form.id ? "แก้ไขช่องทาง" : "เพิ่มช่องทาง"}</h2>
              <button className="text-sm text-muted-foreground" onClick={() => setShowForm(false)}>ปิด</button>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <FormField label="ชื่อช่องทาง"><input className="form-input" value={form.name} onChange={(e)=>setForm({ ...form, name: e.target.value })} /></FormField>
              <FormField label="ประเภทค่าธรรมเนียม">
                <select className="form-input" value={form.feeType} onChange={(e)=>setForm({ ...form, feeType: e.target.value as FeeType })}>
                  <option value="none">ไม่มีค่าธรรมเนียม</option>
                  <option value="fixed">ค่าตายตัว (฿)</option>
                  <option value="percent">เปอร์เซ็นต์ (%)</option>
                </select>
              </FormField>
              <FormField label="ค่า">
                <input type="number" className="form-input" value={form.feeValue} min={0} max={form.feeType === "percent" ? 100 : undefined} onChange={(e)=>setForm({ ...form, feeValue: e.target.value })} disabled={form.feeType === "none"} />
              </FormField>
              <FormField label="สถานะ">
                <select className="form-input" value={form.isActive ? "active" : "inactive"} onChange={(e)=>setForm({ ...form, isActive: e.target.value === "active" })}>
                  <option value="active">เปิดใช้งาน</option>
                  <option value="inactive">ปิดใช้งาน</option>
                </select>
              </FormField>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm" onClick={handleSubmit}>{form.id ? "บันทึก" : "เพิ่ม"}</button>
              <button className="px-4 py-2 rounded border text-sm" onClick={()=>setShowForm(false)}>ยกเลิก</button>
            </div>
          </div>
        ) : null}

        <DataTable
          columns={[
            { key: "name", header: "ช่องทาง" },
            { key: "feeType", header: "ประเภทค่าธรรมเนียม", render: (r) => r.feeType },
            { key: "feeValue", header: "ค่า", render: (r) => r.feeType === "percent" ? `${r.feeValue}%` : r.feeType === "none" ? "0" : `฿${r.feeValue}` },
            { key: "isActive", header: "สถานะ", render: (r) => <StatusBadge label={r.isActive ? "active" : "inactive"} tone={r.isActive ? "success" : "warning"} /> },
            { key: "actions", header: "จัดการ", render: (r) => (
              <div className="flex gap-2 text-sm">
                <button className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-muted" onClick={()=>{ setForm({ id: r.id, name: r.name, feeType: r.feeType, feeValue: String(r.feeValue), isActive: r.isActive }); setShowForm(true); }}>
                  <Edit3 className="w-4 h-4" /> แก้ไข
                </button>
                <button className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-muted" onClick={()=>orderService.setChannelActive(r.id, !r.isActive)}>
                  <Power className="w-4 h-4" /> {r.isActive ? "ปิด" : "เปิด"}
                </button>
                <button className="inline-flex items-center gap-1 px-2 py-1 rounded border border-destructive text-destructive hover:bg-destructive/10" onClick={()=>orderService.deleteOrDeactivateChannel(r.id)}>
                  <Trash2 className="w-4 h-4" /> ลบ/ปิด
                </button>
              </div>
            ) },
          ]}
          rows={channels}
        />
        {channels.length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีช่องทาง</p> : null}
      </div>
    </AppLayout>
  );
}
