import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Edit3, Power } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import FormField from "@/components/shared/FormField";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { orderService, type FeeType, type SalesChannel } from "@/features/store/orderService";

type FormState = { id?: string; name: string; feeType: FeeType; feeValue: string; isActive: boolean };
const emptyForm: FormState = { name: "", feeType: "none", feeValue: "0", isActive: true };

export default function AdminSalesChannelsPage() {
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string>("");
  const [info, setInfo] = useState<string>("");

  const activeCount = useMemo(() => channels.filter((c) => c.isActive).length, [channels]);

  const refresh = () => {
    setChannels(orderService.listChannels(true));
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setError("");
  };

  const handleSubmit = () => {
    setError("");
    try {
      orderService.upsertChannel({
        id: form.id,
        name: form.name,
        feeType: form.feeType,
        feeValue: Number(form.feeValue || 0),
        isActive: form.isActive,
      });
      setInfo(form.id ? "อัปเดตช่องทางเรียบร้อย" : "เพิ่มช่องทางเรียบร้อย");
      resetForm();
      setShowForm(false);
      refresh();
    } catch (err: any) {
      setError(err?.message || "บันทึกไม่สำเร็จ");
    }
  };

  const handleDeleteOrDeactivate = (id: string) => {
    const result = orderService.deleteOrDeactivateChannel(id);
    setInfo(result === "deleted" ? "ลบช่องทางแล้ว" : "ปิดการใช้งานช่องทางที่มีประวัติออเดอร์แล้ว");
    refresh();
  };

  const handleToggleActive = (id: string, isActive: boolean) => {
    orderService.setChannelActive(id, isActive);
    setInfo(isActive ? "เปิดใช้งานช่องทางแล้ว" : "ปิดใช้งานช่องทางแล้ว");
    refresh();
  };

  const feeTypeOptions: { label: string; value: FeeType }[] = [
    { label: "ไม่มีค่าธรรมเนียม", value: "none" },
    { label: "ค่าตายตัว (฿)", value: "fixed" },
    { label: "เปอร์เซ็นต์ (%)", value: "percent" },
  ];

  return (
    <AdminLayout
      title="ตั้งค่าช่องทางขาย"
      subtitle="จัดการช่องทางขายของร้านและค่าธรรมเนียมต่อช่องทาง"
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          type="button"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <Plus className="w-4 h-4" /> เพิ่มช่องทาง
        </button>
        <span className="text-sm text-muted-foreground">ช่องทางที่เปิดใช้งาน: {activeCount}</span>
        {info ? <span className="text-xs text-foreground/80 bg-muted px-2 py-1 rounded">{info}</span> : null}
      </div>

      {showForm ? (
        <div className="stat-card space-y-3 mb-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="section-title text-base">{form.id ? "แก้ไขช่องทาง" : "เพิ่มช่องทางใหม่"}</h2>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              ปิดฟอร์ม
            </button>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <FormField label="ชื่อช่องทาง">
              <input
                className="form-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="เช่น หน้าร้าน, LINE OA, Grab"
              />
            </FormField>
            <FormField label="ประเภทค่าธรรมเนียม">
              <select
                className="form-input"
                value={form.feeType}
                onChange={(e) => setForm({ ...form, feeType: e.target.value as FeeType })}
              >
                {feeTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="ค่า (฿ หรือ %)">
              <input
                type="number"
                className="form-input"
                value={form.feeValue}
                min={form.feeType === "percent" ? 0 : 0}
                max={form.feeType === "percent" ? 100 : undefined}
                onChange={(e) => setForm({ ...form, feeValue: e.target.value })}
                disabled={form.feeType === "none"}
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
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-semibold"
            >
              {form.id ? "บันทึกการแก้ไข" : "เพิ่มช่องทาง"}
            </button>
            <button
              type="button"
              onClick={() => { resetForm(); setShowForm(false); }}
              className="px-4 py-2 rounded border text-sm"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : null}

      <div className="stat-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">ช่องทางทั้งหมด</h2>
          <span className="text-xs text-muted-foreground">{channels.length} ช่องทาง</span>
        </div>
        <DataTable
          columns={[
            { key: "name", header: "ช่องทาง" },
            { key: "feeType", header: "ประเภทค่าธรรมเนียม", render: (r) => r.feeType },
            { key: "feeValue", header: "ค่า", render: (r) => r.feeType === "percent" ? `${r.feeValue}%` : r.feeType === "none" ? "0" : `฿${r.feeValue}` },
            { key: "isActive", header: "สถานะ", render: (r) => <StatusBadge label={r.isActive ? "active" : "inactive"} tone={r.isActive ? "success" : "warning"} /> },
            {
              key: "actions",
              header: "จัดการ",
              render: (r) => (
                <div className="flex gap-2 text-sm">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-muted"
                    onClick={() => {
                      setForm({ id: r.id, name: r.name, feeType: r.feeType, feeValue: String(r.feeValue), isActive: r.isActive });
                      setShowForm(true);
                    }}
                  >
                    <Edit3 className="w-4 h-4" /> แก้ไข
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-muted"
                    onClick={() => handleToggleActive(r.id, !r.isActive)}
                  >
                    <Power className="w-4 h-4" /> {r.isActive ? "ปิด" : "เปิด"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteOrDeactivate(r.id)}
                  >
                    <Trash2 className="w-4 h-4" /> ลบ/ปิด
                  </button>
                </div>
              ),
            },
          ]}
          rows={channels}
        />
        {channels.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground mt-3">ยังไม่มีช่องทาง โปรดกด “เพิ่มช่องทาง”</p>
        ) : null}
      </div>
    </AdminLayout>
  );
}
