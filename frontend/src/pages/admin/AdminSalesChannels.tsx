import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Edit3, Power } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import FormField from "@/components/shared/FormField";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { storeAdminApi, type FeeType, type ChannelType, type ApiSalesChannel, type SalesChannelPayload } from "@/services/storeAdminApi";

type FormState = { id?: string; name: string; type: ChannelType; feeType: FeeType; feeValue: string; isActive: boolean };
const emptyForm: FormState = { name: "", type: "direct", feeType: "none", feeValue: "0", isActive: true };

export default function AdminSalesChannelsPage() {
  const [channels, setChannels] = useState<ApiSalesChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string>("");
  const [info, setInfo] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);

  const activeCount = useMemo(() => channels.filter((c) => c.is_active ?? true).length, [channels]);

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      const items = await storeAdminApi.listSalesChannels();
      setChannels(items);
    } catch (err: any) {
      setError(err?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setError("");
  };

  const handleSubmit = async () => {
    setError("");
    const payload: SalesChannelPayload = {
      name: form.name.trim(),
      type: form.type,
      fee_type: form.feeType,
      fee_value: Number(form.feeValue || 0),
      is_active: form.isActive,
    };

    if (!payload.name) return setError("ต้องกรอกชื่อช่องทาง");
    if (payload.fee_type === "percent" && (payload.fee_value < 0 || payload.fee_value > 100)) {
      return setError("เปอร์เซ็นต์ค่าธรรมเนียมต้องอยู่ระหว่าง 0-100");
    }
    if (payload.fee_type === "fixed" && payload.fee_value < 0) {
      return setError("ค่าธรรมเนียมต้องไม่ติดลบ");
    }
    if (payload.fee_type === "none") payload.fee_value = 0;

    try {
      if (form.id) {
        await storeAdminApi.updateSalesChannel(form.id, payload);
        setInfo("อัปเดตช่องทางเรียบร้อย");
      } else {
        await storeAdminApi.createSalesChannel(payload);
        setInfo("เพิ่มช่องทางเรียบร้อย");
      }
      resetForm();
      setShowForm(false);
      void refresh();
    } catch (err: any) {
      const reason = err?.message || "บันทึกไม่สำเร็จ";
      if (reason === "channel_name_exists") {
        setError("มีชื่อช่องทางนี้แล้ว");
      } else if (reason === "unauthorized" || reason === "missing_token") {
        setError("ต้องเข้าสู่ระบบก่อนใช้งาน");
      } else {
        setError(reason);
      }
    }
  };

  const handleDeleteChannel = async (id: string) => {
    const confirmed = window.confirm("การลบช่องทางจะลบประวัติช่องทางนี้ คุณต้องการดำเนินการต่อหรือไม่?");
    if (!confirmed) return;
    setError("");
    try {
      const result = await storeAdminApi.deleteSalesChannel(id);
      if (result.status === "deactivated") {
        setInfo("ปิดการใช้งานช่องทางที่มีประวัติออเดอร์แล้ว");
      } else {
        setInfo("ลบช่องทางแล้ว");
      }
    } catch (err: any) {
      const msg = err?.message || "ลบไม่สำเร็จ";
      if (msg === "channel_has_history") setInfo("ไม่สามารถลบได้ มีประวัติออเดอร์");
      else setError(msg);
    }
    void refresh();
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    setError("");
    try {
      await storeAdminApi.updateSalesChannel(id, { is_active: isActive });
      setInfo(isActive ? "เปิดใช้งานช่องทางแล้ว" : "ปิดใช้งานช่องทางแล้ว");
    } catch (err: any) {
      setError(err?.message || "อัปเดตไม่สำเร็จ");
    }
    void refresh();
  };

  const feeTypeOptions: { label: string; value: FeeType }[] = [
    { label: "ไม่มีค่าธรรมเนียม", value: "none" },
    { label: "ค่าตายตัว (฿)", value: "fixed" },
    { label: "เปอร์เซ็นต์ (%)", value: "percent" },
  ];

  const channelTypeOptions: { label: string; value: ChannelType }[] = [
    { label: "หน้าร้าน", value: "direct" },
    { label: "เดลิเวอรี", value: "delivery" },
    { label: "ออฟไลน์/อื่นๆ", value: "manual" },
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
        {refreshing ? <span className="text-xs text-muted-foreground">กำลังโหลด...</span> : null}
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
          <div className="grid md:grid-cols-4 gap-3">
            <FormField label="ชื่อช่องทาง">
              <input
                className="form-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="เช่น หน้าร้าน, LINE OA, Grab"
              />
            </FormField>
            <FormField label="ประเภทช่องทาง">
              <select
                className="form-input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as ChannelType })}
              >
                {channelTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
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
            {
              key: "type",
              header: "ประเภท",
              render: (r) => {
                if (r.type === "delivery") return "เดลิเวอรี";
                if (r.type === "manual") return "ออฟไลน์/อื่นๆ";
                return "หน้าร้าน";
              },
            },
            {
              key: "fee_type",
              header: "ประเภทค่าธรรมเนียม",
              render: (r) => {
                if (r.fee_type === "percent") return "เปอร์เซ็นต์";
                if (r.fee_type === "fixed") return "ค่าตายตัว";
                return "ไม่มีค่าธรรมเนียม";
              },
            },
            { key: "fee_value", header: "ค่า", render: (r) => r.fee_type === "percent" ? `${r.fee_value}%` : r.fee_type === "none" ? "0" : `฿${r.fee_value}` },
            { key: "is_active", header: "สถานะ", render: (r) => <StatusBadge label={(r.is_active ?? true) ? "active" : "inactive"} tone={(r.is_active ?? true) ? "success" : "warning"} /> },
            {
              key: "actions",
              header: "จัดการ",
              render: (r) => (
                <div className="flex gap-2 text-sm">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-muted"
                    onClick={() => {
                      setForm({ id: r.id, name: r.name, type: (r.type as ChannelType) ?? "direct", feeType: r.fee_type, feeValue: String(r.fee_value), isActive: r.is_active ?? true });
                      setShowForm(true);
                    }}
                  >
                    <Edit3 className="w-4 h-4" /> แก้ไข
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-muted"
                    onClick={() => handleToggleActive(r.id, !(r.is_active ?? true))}
                  >
                    <Power className="w-4 h-4" /> {(r.is_active ?? true) ? "ปิด" : "เปิด"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteChannel(r.id)}
                  >
                    <Trash2 className="w-4 h-4" /> ลบถาวร
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
        {error && !loading ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
      </div>
    </AdminLayout>
  );
}
