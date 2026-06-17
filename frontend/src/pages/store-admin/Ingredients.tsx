import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Plus, RefreshCw } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import DataTable from "@/components/shared/DataTable";
import FormField from "@/components/shared/FormField";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileUploadField } from "@/components/ui/file-upload";
import { storeAdminApi, INGREDIENT_BASE_UNITS, type ApiIngredient, type CreateStockIntakePayload, type IngredientBaseUnit, type IngredientPayload } from "@/services/storeAdminApi";

type FormState = {
  id?: string;
  name: string;
  unit: IngredientBaseUnit | "";
  costPerUnit: string;
  currentStock: string;
  lowStockThreshold: string;
  supplierName: string;
  isActive: boolean;
};

const BASE_UNIT_LABELS: Record<IngredientBaseUnit, string> = {
  g: "กรัม (g)",
  ml: "มิลลิลิตร (ml)",
  pcs: "ชิ้น (pcs)",
  set: "ชุด (set)",
  bottle: "ขวด (bottle)",
};

const BASE_UNIT_OPTIONS = INGREDIENT_BASE_UNITS.map((unit) => ({ value: unit, label: BASE_UNIT_LABELS[unit] }));
const UNIT_HELPER_TEXT = "เลือกหน่วยฐานที่ใช้ในสูตร เช่น กาแฟใช้ g, นมหรือน้ำใช้ ml, แก้ว+ฝาใช้ set, หลอดหรือสติ๊กเกอร์ใช้ pcs";
const COST_HELPER_TEXT = "หลังจากบันทึกซื้อเข้าสต็อก ระบบจะอัปเดตต้นทุนต่อหน่วยจากราคาซื้อจริงให้อัตโนมัติ";
const STOCK_HELPER_TEXT = "หลังจากนี้ควรเพิ่มสต็อกผ่านปุ่มบันทึกซื้อเข้าสต็อก เพื่อให้ต้นทุนและจำนวนสต็อกถูกต้อง";

const RECEIPT_ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

type PurchaseUnitOption = { label: string; unit: string; factor: number; requiresCount?: boolean };

const PURCHASE_UNIT_OPTIONS: Record<string, PurchaseUnitOption[]> = {
  g: [
    { label: "กรัม (g)", unit: "g", factor: 1 },
    { label: "กิโลกรัม (kg)", unit: "kg", factor: 1000 },
  ],
  kg: [
    { label: "กิโลกรัม (kg)", unit: "kg", factor: 1 },
    { label: "กรัม (g)", unit: "g", factor: 1 / 1000 },
  ],
  ml: [
    { label: "มิลลิลิตร (ml)", unit: "ml", factor: 1 },
    { label: "ลิตร (L)", unit: "L", factor: 1000 },
  ],
  l: [
    { label: "ลิตร (L)", unit: "L", factor: 1 },
    { label: "มิลลิลิตร (ml)", unit: "ml", factor: 1 / 1000 },
  ],
  pcs: [
    { label: "ชิ้น/pcs", unit: "pcs", factor: 1 },
    { label: "แพ็ก/pack", unit: "pack", factor: 1, requiresCount: true },
  ],
  ชิ้น: [
    { label: "ชิ้น", unit: "ชิ้น", factor: 1 },
    { label: "แพ็ก", unit: "แพ็ก", factor: 1, requiresCount: true },
  ],
  set: [
    { label: "ชุด/set", unit: "set", factor: 1 },
    { label: "แพ็ก/pack", unit: "pack", factor: 1, requiresCount: true },
  ],
  ชุด: [
    { label: "ชุด", unit: "ชุด", factor: 1 },
    { label: "แพ็ก", unit: "แพ็ก", factor: 1, requiresCount: true },
  ],
  bottle: [
    { label: "ขวด/bottle", unit: "bottle", factor: 1 },
    { label: "แพ็ก/pack", unit: "pack", factor: 1, requiresCount: true },
  ],
  ขวด: [
    { label: "ขวด", unit: "ขวด", factor: 1 },
    { label: "แพ็ก", unit: "แพ็ก", factor: 1, requiresCount: true },
  ],
};

const isPackUnit = (unit: string) => ["pack", "แพ็ก"].includes(unit);

const buildUnitOptions = (ingredientUnit?: string): PurchaseUnitOption[] => {
  if (!ingredientUnit) return [];
  const normalized = ingredientUnit.toLowerCase();
  const base = PURCHASE_UNIT_OPTIONS[normalized as keyof typeof PURCHASE_UNIT_OPTIONS];
  if (base) return base;
  return [
    { label: `${ingredientUnit}`, unit: ingredientUnit, factor: 1 },
    { label: "กำหนดเอง", unit: ingredientUnit, factor: 1 },
  ];
};

const formatDateTimeLocal = (value?: string | Date) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num: number) => num.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDateOnly = (value?: string | Date) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num: number) => num.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const isIngredientBaseUnit = (value: string): value is IngredientBaseUnit => INGREDIENT_BASE_UNITS.includes(value as IngredientBaseUnit);

const emptyForm: FormState = {
  name: "",
  unit: "",
  costPerUnit: "0",
  currentStock: "0",
  lowStockThreshold: "0",
  supplierName: "",
  isActive: true,
};

type IntakeFormState = {
  ingredientId: string;
  quantity: string;
  purchaseUnit: string;
  conversionFactor: string;
  totalCost: string;
  supplierName: string;
  paymentStatus: "paid" | "unpaid";
  paidAt: string;
  dueDate: string;
  note: string;
  receiptUrl: string;
  receiptStoragePath: string;
  receiptFile?: File | null;
  receiptUploading?: boolean;
  receiptError?: string | null;
};

const buildIntakeForm = (ingredient?: ApiIngredient): IntakeFormState => ({
  ingredientId: ingredient?.id || "",
  quantity: "1",
  purchaseUnit: ingredient?.unit || "",
  conversionFactor: "1",
  totalCost: "",
  supplierName: ingredient?.supplier_name || "",
  paymentStatus: "paid",
  paidAt: formatDateTimeLocal(new Date()),
  dueDate: "",
  note: "",
  receiptUrl: "",
  receiptStoragePath: "",
  receiptFile: null,
  receiptUploading: false,
  receiptError: null,
});

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("th-TH", { hour12: false });
  } catch {
    return value;
  }
};

export default function StoreAdminIngredientsPage() {
  const [rows, setRows] = useState<ApiIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeError, setIntakeError] = useState("");
  const [intakeSubmitting, setIntakeSubmitting] = useState(false);
  const [intakeForm, setIntakeForm] = useState<IntakeFormState>(buildIntakeForm());
  const [initialIntakeForm, setInitialIntakeForm] = useState<IntakeFormState | null>(null);
  const [additionalOpen, setAdditionalOpen] = useState(false);

  const valid = useMemo(
    () =>
      Boolean(
        form.name.trim() &&
          isIngredientBaseUnit(form.unit) &&
          Number(form.costPerUnit) >= 0 &&
          Number(form.currentStock) >= 0 &&
          Number(form.lowStockThreshold) >= 0,
      ),
    [form],
  );
  const normalizedPreview = useMemo(() => {
    const qty = Number(intakeForm.quantity || 0);
    const factor = Number(intakeForm.conversionFactor || 0);
    const value = qty * factor;
    return Number.isFinite(value) ? value : 0;
  }, [intakeForm.quantity, intakeForm.conversionFactor]);
  const selectedIntakeIngredient = useMemo(() => rows.find((r) => r.id === intakeForm.ingredientId), [rows, intakeForm.ingredientId]);
  const intakeValid = useMemo(() => {
    const qty = Number(intakeForm.quantity);
    const factor = Number(intakeForm.conversionFactor);
    const cost = Number(intakeForm.totalCost);
    return Boolean(intakeForm.ingredientId && intakeForm.purchaseUnit.trim()) && qty > 0 && factor > 0 && cost >= 0;
  }, [intakeForm]);
  const unitOptions = useMemo(() => buildUnitOptions(selectedIntakeIngredient?.unit), [selectedIntakeIngredient?.unit]);
  const requiresPackCount = useMemo(() => isPackUnit(intakeForm.purchaseUnit), [intakeForm.purchaseUnit]);
  const intakeDirty = useMemo(() => {
    if (!initialIntakeForm) return false;
    return JSON.stringify({ ...initialIntakeForm, receiptFile: null }) !== JSON.stringify({ ...intakeForm, receiptFile: null });
  }, [initialIntakeForm, intakeForm]);

  const approximateUnitCost = useMemo(() => {
    const normalized = normalizedPreview;
    if (!normalized) return 0;
    return Number(intakeForm.totalCost || 0) / normalized;
  }, [normalizedPreview, intakeForm.totalCost]);

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

  useEffect(() => {
    if (!intakeOpen) return;
    setIntakeForm((prev) => {
      const ingredient = rows.find((r) => r.id === prev.ingredientId);
      if (!ingredient) return prev;
      let changed = false;
      const next = { ...prev };
      if (!next.purchaseUnit && ingredient.unit) {
        next.purchaseUnit = ingredient.unit;
        changed = true;
      }
      if (!next.supplierName && ingredient.supplier_name) {
        next.supplierName = ingredient.supplier_name;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [intakeOpen, intakeForm.ingredientId, rows]);

  const handleSubmit = async () => {
    if (!valid) {
      setError("กรุณากรอกข้อมูลวัตถุดิบให้ครบและตัวเลขต้องไม่ติดลบ");
      return;
    }
    if (!isIngredientBaseUnit(form.unit)) {
      setError("กรุณาเลือกหน่วยฐานที่ใช้ในสูตร");
      return;
    }

    const payload: IngredientPayload = {
      name: form.name.trim(),
      unit: form.unit,
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

  const openIntakeModal = (ingredient?: ApiIngredient) => {
    if (!rows.length && !ingredient) {
      setError("กรุณาเพิ่มวัตถุดิบก่อนบันทึกสต็อก");
      return;
    }
    const base = ingredient || rows[0];
    const baseline = buildIntakeForm(base);
    setIntakeForm(baseline);
    setInitialIntakeForm(baseline);
    setAdditionalOpen(false);
    setIntakeError("");
    setIntakeOpen(true);
  };

  const closeIntakeModal = () => {
    setIntakeOpen(false);
    setIntakeForm(buildIntakeForm());
    setInitialIntakeForm(null);
    setAdditionalOpen(false);
    setIntakeError("");
  };

  const handleDialogOpenChange = (openState: boolean) => {
    if (openState) {
      setIntakeOpen(true);
      return;
    }
    if (intakeDirty) {
      const confirmed = window.confirm("ยังไม่ได้บันทึกการเปลี่ยนแปลง ต้องการปิดหรือไม่?");
      if (!confirmed) {
        setIntakeOpen(true);
        return;
      }
    }
    closeIntakeModal();
  };

  const handleIntakeChange = (field: keyof IntakeFormState, value: string) => {
    setIntakeForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePaymentStatusChange = (value: "paid" | "unpaid") => {
    setIntakeForm((prev) => ({
      ...prev,
      paymentStatus: value,
      dueDate: value === "paid" ? "" : prev.dueDate || formatDateOnly(new Date()),
    }));
  };

  const submitIntake = async () => {
    if (!intakeValid) {
      setIntakeError("กรุณากรอกจำนวน หน่วยซื้อ ต้นทุน และแปลงหน่วยให้ถูกต้อง");
      return;
    }
    const payload: CreateStockIntakePayload = {
      ingredient_id: intakeForm.ingredientId,
      quantity: Number(intakeForm.quantity),
      purchase_unit: intakeForm.purchaseUnit.trim(),
      conversion_factor: Number(intakeForm.conversionFactor),
      total_cost: Number(intakeForm.totalCost),
      payment_status: intakeForm.paymentStatus,
    };
    if (intakeForm.supplierName.trim()) payload.supplier_name = intakeForm.supplierName.trim();
    if (intakeForm.note.trim()) payload.note = intakeForm.note.trim();
    if (intakeForm.paidAt) payload.paid_at = new Date(intakeForm.paidAt).toISOString();
    if (intakeForm.dueDate) payload.due_date = intakeForm.dueDate;

    setIntakeSubmitting(true);
    setIntakeError("");
    try {
      const response = await storeAdminApi.createStockIntake(payload);
      const purchaseId = response.intake?.id;
      let receiptUploaded = true;
      if (purchaseId && intakeForm.receiptFile && response.intake?.store_id) {
        receiptUploaded = await uploadReceiptFile(purchaseId, response.intake.store_id, intakeForm.receiptFile);
      }
      setInfo(receiptUploaded ? "บันทึกซื้อเข้าสต็อกแล้ว" : "บันทึกสต็อกแล้ว แต่แนบใบเสร็จไม่สำเร็จ");
      closeIntakeModal();
      void refresh();
    } catch (err: any) {
      const reason = err?.message || "บันทึกสต็อกไม่สำเร็จ";
      setIntakeError(reason);
    } finally {
      setIntakeSubmitting(false);
    }
  };

  const uploadReceiptFile = async (purchaseId: string, storeId: string, file: File) => {
    const allowed = RECEIPT_ALLOWED_TYPES.includes(file.type);
    if (!allowed) {
      setIntakeForm((prev) => ({ ...prev, receiptError: "ประเภทไฟล์ไม่รองรับ" }));
      return false;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      setIntakeForm((prev) => ({ ...prev, receiptError: "ไฟล์ต้องไม่เกิน 5MB" }));
      return false;
    }
    setIntakeForm((prev) => ({ ...prev, receiptUploading: true, receiptError: null }));
    try {
      await storeAdminApi.uploadStockIntakeReceipt(purchaseId, file, storeId);
      setIntakeForm((prev) => ({ ...prev, receiptFile: null, receiptError: null }));
      return true;
    } catch (error: any) {
      setIntakeForm((prev) => ({ ...prev, receiptError: error?.message || "อัปโหลดใบเสร็จไม่สำเร็จ" }));
      return false;
    } finally {
      setIntakeForm((prev) => ({ ...prev, receiptUploading: false }));
    }
  };

  return (
    <AdminLayout title="วัตถุดิบ" subtitle="จัดการข้อมูลวัตถุดิบ ต้นทุนต่อหน่วย และสถานะสต็อก">
      <div className="stat-card space-y-3 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="section-title text-base">{form.id ? "แก้ไขวัตถุดิบ" : "เพิ่มวัตถุดิบ"}</h2>
            {refreshing ? <div className="flex items-center gap-1 text-xs text-muted-foreground"><RefreshCw className="w-3 h-3 animate-spin" /> กำลังโหลด</div> : null}
          </div>
          <button type="button" className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm" onClick={() => openIntakeModal()}>
            <Plus className="w-4 h-4" /> บันทึกซื้อเข้าสต็อก
          </button>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <FormField label="ชื่อวัตถุดิบ">
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="หน่วยฐานที่ใช้ในสูตร" hint={UNIT_HELPER_TEXT}>
            <select
              className="form-input"
              value={form.unit}
              onChange={(e) => {
                const nextValue = e.target.value;
                setForm((prev) => ({ ...prev, unit: isIngredientBaseUnit(nextValue) ? nextValue : "" }));
              }}
            >
              <option value="" disabled>
                เลือกหน่วยฐาน
              </option>
              {BASE_UNIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="ต้นทุนตั้งต้นต่อหน่วย (ถ้ายังไม่มีรายการซื้อเข้า)" hint={COST_HELPER_TEXT}>
            <input type="number" className="form-input" min={0} value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} />
          </FormField>
          <FormField label="สต็อกตั้งต้น" hint={STOCK_HELPER_TEXT}>
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
            {
              key: "unit",
              header: "หน่วย",
              render: (r) => BASE_UNIT_LABELS[r.unit as IngredientBaseUnit] || r.unit,
            },
            { key: "cost_per_unit", header: "ต้นทุน/หน่วย", render: (r) => `฿${Number(r.cost_per_unit).toFixed(4)}` },
            { key: "current_stock", header: "สต็อก", render: (r) => Number(r.current_stock).toLocaleString(undefined, { maximumFractionDigits: 2 }) },
            { key: "low_stock_threshold", header: "แจ้งเตือนต่ำกว่า" },
            { key: "last_purchase_at", header: "ซื้อครั้งล่าสุด", render: (r) => formatDateTime(r.last_purchase_at) },
            {
              key: "cost_source",
              header: "แหล่งต้นทุน",
              render: (r) => {
                if (!r.cost_source) return "-";
                if (r.cost_source === "purchase_derived") return "จากการซื้อ";
                return r.cost_source;
              },
            },
            { key: "supplier_name", header: "ผู้จัดจำหน่าย", render: (r) => r.supplier_name || "-" },
            { key: "is_active", header: "สถานะ", render: (r) => <StatusBadge label={(r.is_active ?? true) ? "active" : "inactive"} tone={(r.is_active ?? true) ? "success" : "warning"} /> },
            {
              key: "actions",
              header: "จัดการ",
              render: (r) => (
                <div className="flex flex-wrap gap-3 text-sm">
                  <button type="button" className="underline" onClick={() => openIntakeModal(r)}>
                    บันทึกสต็อก
                  </button>
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      setForm({
                        id: r.id,
                        name: r.name,
                        unit: isIngredientBaseUnit(r.unit) ? r.unit : "",
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

      <Dialog open={intakeOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>บันทึกซื้อเข้าสต็อก</DialogTitle>
            <DialogDescription>บันทึกปริมาณและต้นทุนเพื่อปรับปรุงสต็อกและค่าเฉลี่ยอัตโนมัติ</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {intakeError ? <p className="text-sm text-destructive">{intakeError}</p> : null}
            <div className="grid md:grid-cols-2 gap-3">
              <FormField label="วัตถุดิบ">
                <select className="form-input" value={intakeForm.ingredientId} onChange={(e) => handleIntakeChange("ingredientId", e.target.value)}>
                  <option value="" disabled hidden>
                    เลือกวัตถุดิบ
                  </option>
                  {rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="จำนวนที่ซื้อ">
                <input type="number" min={0} step="0.01" className="form-input" value={intakeForm.quantity} onChange={(e) => handleIntakeChange("quantity", e.target.value)} />
              </FormField>
              <FormField label="หน่วยที่ซื้อ">
                <select
                  className="form-input"
                  value={intakeForm.purchaseUnit}
                  onChange={(e) => {
                    const option = unitOptions.find((opt) => opt.unit === e.target.value);
                    setIntakeForm((prev) => ({
                      ...prev,
                      purchaseUnit: e.target.value,
                      conversionFactor: option?.requiresCount ? "" : String(option?.factor ?? prev.conversionFactor),
                    }));
                  }}
                >
                  <option value="" disabled hidden>
                    เลือกหน่วยซื้อ
                  </option>
                  {unitOptions.map((opt) => (
                    <option key={opt.unit} value={opt.unit}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </FormField>
              {requiresPackCount ? (
                <FormField label={`1 แพ็กมีกี่${selectedIntakeIngredient?.unit || "หน่วย"}?`}>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    className="form-input"
                    value={intakeForm.conversionFactor}
                    onChange={(e) => handleIntakeChange("conversionFactor", e.target.value)}
                  />
                </FormField>
              ) : (
                <input type="hidden" value={intakeForm.conversionFactor} readOnly />
              )}
              <FormField label="ต้นทุนรวม (฿)">
                <input type="number" min={0} step="0.01" className="form-input" value={intakeForm.totalCost} onChange={(e) => handleIntakeChange("totalCost", e.target.value)} />
              </FormField>
            </div>
            {selectedIntakeIngredient ? (
              <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                <p>
                  สต็อกปัจจุบัน: <span className="font-medium">{Number(selectedIntakeIngredient.current_stock).toLocaleString(undefined, { maximumFractionDigits: 2 })} {selectedIntakeIngredient.unit}</span>
                </p>
                <p>
                  ต้นทุนเฉลี่ย: <span className="font-medium">฿{Number(selectedIntakeIngredient.cost_per_unit).toFixed(4)}</span>
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between text-sm">
              <span>
                ปริมาณสุทธิที่จะเพิ่ม: <strong>{normalizedPreview.toFixed(4)}</strong> {selectedIntakeIngredient?.unit || "หน่วยฐาน"}
              </span>
              <span className="text-muted-foreground">
                {intakeForm.purchaseUnit
                  ? `1 ${intakeForm.purchaseUnit} = ${Number(intakeForm.conversionFactor || 0).toLocaleString()} ${selectedIntakeIngredient?.unit ?? "หน่วย"}`
                  : "แปลงเป็นหน่วยฐาน = จำนวน × ตัวคูณ"}
              </span>
              <span className="text-muted-foreground">
                {approximateUnitCost > 0
                  ? `ต้นทุนต่อหน่วยโดยประมาณ: ฿${approximateUnitCost.toFixed(4)} / ${selectedIntakeIngredient?.unit || "หน่วยฐาน"}`
                  : "ต้นทุนต่อหน่วยโดยประมาณ: -"}
              </span>
            </div>
            <div className="rounded-lg border border-dashed p-4 space-y-2">
              <FileUploadField
                label="แนบรูปใบเสร็จ / สลิปซื้อของ (ไม่บังคับ)"
                description="รองรับไฟล์ JPG, PNG, WEBP ไม่เกิน 5MB"
                accept={RECEIPT_ALLOWED_TYPES.join(",")}
                disabled={intakeSubmitting || intakeForm.receiptUploading}
                file={intakeForm.receiptFile ?? null}
                onFileSelect={(file) => setIntakeForm((prev) => ({ ...prev, receiptFile: file, receiptError: null }))}
                error={intakeForm.receiptError ?? undefined}
              />
              {intakeForm.receiptUploading ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> กำลังอัปโหลดใบเสร็จ...
                </p>
              ) : null}
            </div>
            <Collapsible open={additionalOpen} onOpenChange={setAdditionalOpen}>
              <div className="rounded-lg border p-3">
                <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
                  <span>รายละเอียดเพิ่มเติม</span>
                  <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 grid md:grid-cols-2 gap-3">
                    <FormField label="ผู้จัดจำหน่าย">
                      <input className="form-input" value={intakeForm.supplierName} onChange={(e) => handleIntakeChange("supplierName", e.target.value)} />
                    </FormField>
                    <FormField label="สถานะการชำระ">
                      <select className="form-input" value={intakeForm.paymentStatus} onChange={(e) => handlePaymentStatusChange(e.target.value as "paid" | "unpaid")}>
                        <option value="paid">ชำระแล้ว</option>
                        <option value="unpaid">ยังไม่ชำระ</option>
                      </select>
                    </FormField>
                    <FormField label="วันที่ชำระ">
                      <input type="datetime-local" className="form-input" value={intakeForm.paidAt} onChange={(e) => handleIntakeChange("paidAt", e.target.value)} />
                    </FormField>
                    {intakeForm.paymentStatus === "unpaid" ? (
                      <FormField label="กำหนดชำระ">
                        <input type="date" className="form-input" value={intakeForm.dueDate} onChange={(e) => handleIntakeChange("dueDate", e.target.value)} />
                      </FormField>
                    ) : null}
                    <div className="md:col-span-2">
                      <FormField label="บันทึกเพิ่มเติม">
                        <textarea className="form-input" rows={3} value={intakeForm.note} onChange={(e) => handleIntakeChange("note", e.target.value)} />
                      </FormField>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
            <DialogFooter className="flex flex-wrap justify-end gap-2">
              <button type="button" className="px-4 py-2 rounded border" onClick={() => handleDialogOpenChange(false)} disabled={intakeSubmitting}>
                ยกเลิก
              </button>
              <button type="button" className="px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50" disabled={!intakeValid || intakeSubmitting} onClick={submitIntake}>
                {intakeSubmitting ? "กำลังบันทึก..." : "บันทึกสต็อก"}
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
