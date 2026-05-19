import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";
import FormField from "@/components/shared/FormField";
import StatusBadge from "@/components/shared/StatusBadge";
import { orderService, type ChannelType, type FeeType, type SalesChannel } from "@/features/store/orderService";

const empty = { id: "", name: "", type: "direct" as ChannelType, feeType: "none" as FeeType, feeValue: "0", isActive: true };

export default function SalesChannels() {
  const [rows, setRows] = useState<SalesChannel[]>(orderService.listChannels(true));
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => form.name.trim().length > 0, [form.name]);

  function refresh() { setRows(orderService.listChannels(true)); }

  function submit() {
    if (!canSubmit) return setError("กรุณากรอกชื่อช่องทาง");
    const feeValue = form.feeType === "none" ? 0 : Number(form.feeValue);
    if (Number.isNaN(feeValue) || feeValue < 0) return setError("ค่าธรรมเนียมไม่ถูกต้อง");

    orderService.upsertChannel({
      id: form.id || undefined,
      name: form.name,
      type: form.type,
      feeType: form.feeType,
      feeValue,
      isActive: form.isActive,
    });

    setForm(empty);
    setError("");
    refresh();
  }

  function toggleActive(row: SalesChannel) {
    orderService.setChannelActive(row.id, !row.isActive);
    refresh();
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="page-title">ช่องทางการขาย</h1>

        <div className="stat-card grid md:grid-cols-3 gap-3">
          <FormField label="ชื่อช่องทาง">
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>

          <FormField label="ประเภทช่องทาง">
            <select className="form-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ChannelType })}>
              <option value="direct">direct</option>
              <option value="delivery">delivery</option>
              <option value="manual">manual</option>
            </select>
          </FormField>

          <FormField label="ประเภทค่าธรรมเนียม">
            <select className="form-input" value={form.feeType} onChange={(e) => {
              const feeType = e.target.value as FeeType;
              setForm({ ...form, feeType, feeValue: feeType === "none" ? "0" : form.feeValue });
            }}>
              <option value="none">none</option>
              <option value="percent">percent</option>
              <option value="fixed">fixed</option>
            </select>
          </FormField>

          <FormField label="ค่าธรรมเนียม">
            <input
              type="number"
              className="form-input"
              value={form.feeType === "none" ? "0" : form.feeValue}
              disabled={form.feeType === "none"}
              onChange={(e) => setForm({ ...form, feeValue: e.target.value })}
            />
          </FormField>

          <div className="md:col-span-2 flex items-end gap-2">
            <button className="bg-primary text-primary-foreground px-4 py-2 rounded" onClick={submit}>{form.id ? "บันทึกการแก้ไข" : "เพิ่มช่องทาง"}</button>
            {form.id ? <button className="px-4 py-2 rounded border" onClick={() => setForm(empty)}>ยกเลิก</button> : null}
          </div>
          {error ? <p className="md:col-span-3 text-sm text-red-600">{error}</p> : null}
        </div>

        <DataTable
          columns={[
            { key: "name", header: "ชื่อช่องทาง", render: (r) => <button className="underline" onClick={() => setForm({ id: r.id, name: r.name, type: r.type, feeType: r.feeType, feeValue: String(r.feeValue), isActive: r.isActive })}>{r.name}</button> },
            { key: "type", header: "type" },
            { key: "feeType", header: "fee_type" },
            { key: "feeValue", header: "fee_value" },
            { key: "isActive", header: "สถานะ", render: (r) => <StatusBadge label={r.isActive ? "active" : "inactive"} tone={r.isActive ? "success" : "warning"} /> },
            { key: "actions", header: "จัดการ", render: (r) => (
              <div className="space-x-2">
                <button className="text-sm underline" onClick={() => setForm({ id: r.id, name: r.name, type: r.type, feeType: r.feeType, feeValue: String(r.feeValue), isActive: r.isActive })}>แก้ไข</button>
                <button className="text-sm" onClick={() => toggleActive(r)}>{r.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>
              </div>
            )},
          ]}
          rows={rows}
        />
      </div>
    </AppLayout>
  );
}
