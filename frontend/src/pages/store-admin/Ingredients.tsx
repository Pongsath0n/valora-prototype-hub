import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, Plus, RefreshCw } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import DataTable from "@/components/shared/DataTable";
import FormField from "@/components/shared/FormField";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileUploadField } from "@/components/ui/file-upload";
import { useProfileRole } from "@/contexts/RoleContext";
import { STORE_MANAGER_ROLES } from "@/lib/guards";
import {
  storeAdminApi,
  INGREDIENT_BASE_UNITS,
  INGREDIENT_WASTE_REASONS,
  type ApiIngredient,
  type CreateStockIntakePayload,
  type IngredientBaseUnit,
  type IngredientPayload,
  type IngredientWasteCreatePayload,
  type IngredientWasteReason,
  type IngredientWasteRecord,
  type IngredientWasteSummaryResponse,
  type StockIntake,
} from "@/services/storeAdminApi";

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

type WasteFormState = {
  ingredientId: string;
  purchaseId: string;
  quantity: string;
  reason: IngredientWasteReason;
  note: string;
  wastedAt: string;
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

const WASTE_REASON_LABELS: Record<IngredientWasteReason, string> = {
  expired: "หมดอายุ",
  damaged: "เสียหาย/ชำรุด",
  spill: "หกหล่น/เสียระหว่างชง",
  quality_issue: "คุณภาพไม่ผ่าน",
  manual_adjustment: "ปรับยอดสต็อกเอง (เช็คสต็อก)",
  other: "อื่น ๆ",
};

const WASTE_REASON_OPTIONS = INGREDIENT_WASTE_REASONS.map((reason) => ({
  value: reason,
  label: WASTE_REASON_LABELS[reason],
}));

const currencyFormatter = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2 });

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
  isPerishable: boolean;
  lotCode: string;
  expiresAt: string;
  expiryNote: string;
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
  isPerishable: false,
  lotCode: "",
  expiresAt: "",
  expiryNote: "",
});

const buildWasteForm = (): WasteFormState => ({
  ingredientId: "",
  purchaseId: "",
  quantity: "",
  reason: "expired",
  note: "",
  wastedAt: formatDateTimeLocal(new Date()),
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
  const { role, loading: roleLoading } = useProfileRole();
  const isManagerRole = role ? STORE_MANAGER_ROLES.includes(role) : false;
  const shouldShowWasteSection = !roleLoading && isManagerRole;
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
  const [wasteRecords, setWasteRecords] = useState<IngredientWasteRecord[]>([]);
  const [wasteSummary, setWasteSummary] = useState<IngredientWasteSummaryResponse | null>(null);
  const [wasteLoading, setWasteLoading] = useState(false);
  const [wasteError, setWasteError] = useState("");
  const [wasteInfo, setWasteInfo] = useState("");
  const [wasteFormError, setWasteFormError] = useState("");
  const [wasteForm, setWasteForm] = useState<WasteFormState>(buildWasteForm());
  const [wasteSubmitting, setWasteSubmitting] = useState(false);
  const [recentIntakes, setRecentIntakes] = useState<StockIntake[]>([]);
  const [recentIntakesLoading, setRecentIntakesLoading] = useState(false);
  const [wasteEligibleLots, setWasteEligibleLots] = useState<StockIntake[]>([]);
  const [wasteEligibleLoading, setWasteEligibleLoading] = useState(false);
  const [wasteEligibleError, setWasteEligibleError] = useState("");
  const [wasteShowAllIngredients, setWasteShowAllIngredients] = useState(false);

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

  const selectedWasteIngredient = useMemo(() => rows.find((r) => r.id === wasteForm.ingredientId), [rows, wasteForm.ingredientId]);
  const ingredientLookup = useMemo(() => {
    const map: Record<string, ApiIngredient> = {};
    rows.forEach((row) => {
      map[row.id] = row;
    });
    return map;
  }, [rows]);
  const wasteEligiblePurchases = useMemo(() => wasteEligibleLots.filter((lot) => lot.is_perishable || lot.expires_at), [wasteEligibleLots]);
  const wasteEligibleIngredientIds = useMemo(() => {
    const ids = new Set<string>();
    wasteEligiblePurchases.forEach((lot) => {
      if (lot.ingredient_id) ids.add(lot.ingredient_id);
    });
    return ids;
  }, [wasteEligiblePurchases]);
  const recommendedLotOptions = useMemo(
    () =>
      wasteEligiblePurchases.map((lot) => {
        const ingredient = ingredientLookup[lot.ingredient_id ?? ""];
        const remainingStock = ingredient ? Number(ingredient.current_stock).toLocaleString(undefined, { maximumFractionDigits: 2 }) : undefined;
        const parts = [
          ingredient?.name ?? "วัตถุดิบ",
          lot.lot_code ? `Lot ${lot.lot_code}` : "ล็อตล่าสุด",
          remainingStock && ingredient?.unit ? `เหลือ ~${remainingStock} ${ingredient.unit}` : undefined,
          lot.expires_at ? `หมดอายุ ${formatDateOnly(lot.expires_at)}` : "ยังไม่ระบุวันหมดอายุ",
        ].filter(Boolean);
        return {
          value: lot.id,
          ingredientId: lot.ingredient_id,
          label: parts.join(" • "),
        };
      }),
    [ingredientLookup, wasteEligiblePurchases],
  );
  const recommendedLotSelection = useMemo(() => {
    if (!wasteForm.purchaseId) return "";
    return recommendedLotOptions.some((option) => option.value === wasteForm.purchaseId) ? wasteForm.purchaseId : "";
  }, [recommendedLotOptions, wasteForm.purchaseId]);
  const wasteFormValid = useMemo(() => {
    const qty = Number(wasteForm.quantity);
    return Boolean(wasteForm.ingredientId && qty > 0);
  }, [wasteForm.ingredientId, wasteForm.quantity]);
  const filteredWasteIngredients = useMemo(() => {
    const baseList = !wasteShowAllIngredients && wasteEligibleIngredientIds.size > 0 ? rows.filter((row) => wasteEligibleIngredientIds.has(row.id)) : rows;
    if (selectedWasteIngredient && !baseList.some((row) => row.id === selectedWasteIngredient.id)) {
      return [...baseList, selectedWasteIngredient];
    }
    return baseList;
  }, [rows, selectedWasteIngredient, wasteEligibleIngredientIds, wasteShowAllIngredients]);

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

  const refreshWasteEligibleLots = useCallback(async () => {
    if (!isManagerRole) return;
    setWasteEligibleLoading(true);
    setWasteEligibleError("");
    try {
      const list = await storeAdminApi.listStockIntakes({ limit: 100 });
      setWasteEligibleLots(list);
    } catch (err: any) {
      setWasteEligibleError(err?.message || "โหลดล็อตวัตถุดิบไม่สำเร็จ");
      setWasteEligibleLots([]);
    } finally {
      setWasteEligibleLoading(false);
    }
  }, [isManagerRole]);

  const refreshWasteData = useCallback(async () => {
    if (!isManagerRole) return;
    setWasteLoading(true);
    setWasteError("");
    try {
      const [records, summary] = await Promise.all([
        storeAdminApi.listIngredientWasteRecords({ limit: 50 }),
        storeAdminApi.getIngredientWasteSummary(),
      ]);
      setWasteRecords(records);
      setWasteSummary(summary);
      void refreshWasteEligibleLots();
    } catch (err: any) {
      setWasteError(err?.message || "โหลดข้อมูลการทิ้งไม่สำเร็จ");
    } finally {
      setWasteLoading(false);
    }
  }, [isManagerRole, refreshWasteEligibleLots]);

  useEffect(() => {
    if (roleLoading) return;
    void refreshWasteData();
    void refreshWasteEligibleLots();
  }, [roleLoading, refreshWasteData, refreshWasteEligibleLots]);

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

  useEffect(() => {
    if (!isManagerRole || !wasteForm.ingredientId) {
      setRecentIntakes([]);
      return;
    }
    let cancelled = false;
    setRecentIntakesLoading(true);
    storeAdminApi
      .listStockIntakes({ ingredient_id: wasteForm.ingredientId, limit: 10 })
      .then((list) => {
        if (!cancelled) {
          setRecentIntakes(list);
        }
      })
      .catch(() => {
        if (!cancelled) setRecentIntakes([]);
      })
      .finally(() => {
        if (!cancelled) setRecentIntakesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isManagerRole, wasteForm.ingredientId]);

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

  const clearWasteFeedback = useCallback(() => {
    if (wasteFormError) setWasteFormError("");
    if (wasteInfo) setWasteInfo("");
  }, [wasteFormError, wasteInfo]);

  const handleWasteChange = <K extends keyof WasteFormState>(field: K, value: WasteFormState[K]) => {
    setWasteForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "ingredientId") {
        next.purchaseId = "";
      }
      return next;
    });
    clearWasteFeedback();
  };

  const handleRecommendedLotChange = useCallback(
    (lotId: string) => {
      setWasteForm((prev) => {
        if (!lotId) {
          return { ...prev, purchaseId: "" };
        }
        const match = recommendedLotOptions.find((option) => option.value === lotId);
        if (!match) return prev;
        return {
          ...prev,
          ingredientId: match.ingredientId || prev.ingredientId,
          purchaseId: lotId,
        };
      });
      clearWasteFeedback();
    },
    [clearWasteFeedback, recommendedLotOptions],
  );

  const resetWasteForm = () => {
    setWasteForm(buildWasteForm());
    setWasteFormError("");
  };

  const submitWaste = async () => {
    if (!wasteFormValid) {
      setWasteFormError("กรุณาเลือกวัตถุดิบและจำนวนที่ต้องการตัด");
      return;
    }
    const qty = Number(wasteForm.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setWasteFormError("จำนวนที่ทิ้งต้องมากกว่า 0");
      return;
    }
    const payload: IngredientWasteCreatePayload = {
      ingredient_id: wasteForm.ingredientId,
      quantity: qty,
      reason: wasteForm.reason,
    };
    if (wasteForm.purchaseId) payload.purchase_id = wasteForm.purchaseId;
    if (wasteForm.note.trim()) payload.note = wasteForm.note.trim();
    if (wasteForm.wastedAt) {
      const wastedAtDate = new Date(wasteForm.wastedAt);
      if (!Number.isNaN(wastedAtDate.getTime())) {
        payload.wasted_at = wastedAtDate.toISOString();
      }
    }
    setWasteSubmitting(true);
    setWasteFormError("");
    setWasteInfo("");
    try {
      await storeAdminApi.createIngredientWaste(payload);
      setWasteInfo("บันทึกการทิ้งสต็อกแล้ว");
      resetWasteForm();
      void refreshWasteData();
      void refresh();
    } catch (err: any) {
      const reason = err?.message || "บันทึกการทิ้งไม่สำเร็จ";
      if (reason === "insufficient_stock_for_waste") {
        setWasteFormError("สต็อกไม่เพียงพอสำหรับจำนวนที่เลือก");
      } else if (reason === "insufficient_lot_stock_for_waste") {
        setWasteFormError("ล็อตที่เลือกเหลือไม่พอสำหรับจำนวนนี้");
      } else if (reason === "purchase_mismatch") {
        setWasteFormError("รายการซื้อที่เลือกไม่ตรงกับวัตถุดิบนี้");
      } else if (reason === "waste_reason_invalid") {
        setWasteFormError("เหตุผลไม่ถูกต้อง");
      } else if (reason === "ingredient_waste_create_failed" || reason === "ingredient_waste_update_failed") {
        setWasteFormError("ระบบตัดสต็อกไม่สำเร็จ กรุณาลองใหม่");
      } else if (reason === "request_failed" || reason?.toLowerCase?.() === "failed to fetch") {
        setWasteFormError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่");
      } else {
        setWasteFormError("บันทึกการทิ้งไม่สำเร็จ กรุณาลองใหม่");
      }
    } finally {
      setWasteSubmitting(false);
    }
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

  const handleIntakeChange = (field: keyof IntakeFormState, value: IntakeFormState[keyof IntakeFormState]) => {
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
      is_perishable: intakeForm.isPerishable,
    };
    if (intakeForm.supplierName.trim()) payload.supplier_name = intakeForm.supplierName.trim();
    if (intakeForm.note.trim()) payload.note = intakeForm.note.trim();
    if (intakeForm.paidAt) payload.paid_at = new Date(intakeForm.paidAt).toISOString();
    if (intakeForm.dueDate) payload.due_date = intakeForm.dueDate;
    if (intakeForm.lotCode.trim()) payload.lot_code = intakeForm.lotCode.trim();
    if (intakeForm.expiryNote.trim()) payload.expiry_note = intakeForm.expiryNote.trim();
    if (intakeForm.expiresAt) {
      const expiresDate = new Date(`${intakeForm.expiresAt}T00:00:00`);
      if (!Number.isNaN(expiresDate.getTime())) {
        payload.expires_at = expiresDate.toISOString();
      }
    }

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

      {shouldShowWasteSection ? (
        <section className="mt-10 space-y-4 border-t pt-8">
          <div className="space-y-1">
            <h2 className="section-title text-lg">ของเสีย / ของหมดอายุ</h2>
            <p className="text-sm text-muted-foreground">
              บันทึกของที่ต้องทิ้ง เช่น ของหมดอายุ ของเสีย หรือหกหล่น เพื่อให้ยอดสต็อกตรงกับของจริง และดูได้ว่าต้นทุนสูญเสียไปเท่าไร (เห็นเฉพาะเจ้าของ/ผู้จัดการ)
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="stat-card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="section-title text-base">สรุปการทิ้งสต็อก</h3>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs rounded border px-2 py-1"
                  onClick={() => void refreshWasteData()}
                  disabled={wasteLoading}
                >
                  <RefreshCw className={`h-3 w-3 ${wasteLoading ? "animate-spin" : ""}`} /> รีเฟรช
                </button>
              </div>
              {wasteSummary && wasteSummary.record_count > 0 ? (
                <div className="grid gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">จำนวนที่ทิ้งรวม</p>
                    <p className="text-xl font-semibold">{wasteSummary.total_quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} หน่วย</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ต้นทุนสูญเสีย (โดยประมาณ)</p>
                    <p className="text-xl font-semibold">{currencyFormatter.format(wasteSummary.total_cost || 0)}</p>
                    <p className="text-xs text-muted-foreground">ประเมินจากต้นทุนซื้อเข้า ไว้ดูภาพรวมเท่านั้น ไม่ใช่ตัวเลขทางบัญชี</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">จำนวนรายการ</p>
                    <p className="text-xl font-semibold">{wasteSummary.record_count}</p>
                  </div>
                </div>
              ) : wasteSummary ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีการบันทึกของเสีย เมื่อบันทึกแล้ว ยอดที่ทิ้งและต้นทุนสูญเสียจะสรุปให้ที่นี่</p>
              ) : (
                <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล กดรีเฟรชเพื่อโหลดอีกครั้ง</p>
              )}
              {wasteError ? <p className="text-sm text-destructive">{wasteError}</p> : null}
            </div>
            <div className="stat-card space-y-3">
              <div className="space-y-1">
                <h3 className="section-title text-base">บันทึกการทิ้งสต็อก</h3>
                <p className="text-xs text-muted-foreground">เลือกวัตถุดิบและจำนวนที่ต้องทิ้ง ระบบจะตัดออกจากสต็อกให้อัตโนมัติ</p>
              </div>
              <div className="grid gap-3">
                <FormField label="ล็อตที่แนะนำให้ตัด" hint="แนะนำเฉพาะล็อตที่เป็นของสดหรือมีวันหมดอายุ">
                  <select className="form-input" value={recommendedLotSelection} onChange={(e) => handleRecommendedLotChange(e.target.value)} disabled={!recommendedLotOptions.length && !recommendedLotSelection}>
                    <option value="">เลือกล็อตที่ต้องทิ้ง</option>
                    {recommendedLotOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {wasteEligibleLoading ? <p className="text-xs text-muted-foreground mt-1">กำลังโหลดล็อตที่มีวันหมดอายุ...</p> : null}
                  {wasteEligibleError ? <p className="text-xs text-destructive mt-1">{wasteEligibleError}</p> : null}
                  {!wasteEligibleLoading && !recommendedLotOptions.length ? (
                    <p className="text-xs text-muted-foreground mt-1">ยังไม่มีล็อตที่มีวันหมดอายุ ระบบจะแสดงรายชื่อวัตถุดิบทั้งหมดให้เลือกเอง</p>
                  ) : null}
                </FormField>
                <FormField
                  label="วัตถุดิบที่จะตัดสต็อก"
                  hint={
                    wasteEligibleIngredientIds.size > 0 && !wasteShowAllIngredients
                      ? "แสดงเฉพาะวัตถุดิบที่เคยบันทึกวันหมดอายุ สามารถแสดงทั้งหมดได้ที่ปุ่มด้านล่าง"
                      : "กำลังแสดงวัตถุดิบทั้งหมด"
                  }
                >
                  <select className="form-input" value={wasteForm.ingredientId} onChange={(e) => handleWasteChange("ingredientId", e.target.value)}>
                    <option value="" disabled hidden>
                      เลือกวัตถุดิบ
                    </option>
                    {filteredWasteIngredients.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                  {wasteEligibleIngredientIds.size > 0 ? (
                    <button
                      type="button"
                      className="text-xs underline mt-1"
                      onClick={() => setWasteShowAllIngredients((prev) => !prev)}
                    >
                      {wasteShowAllIngredients ? "ซ่อนวัตถุดิบที่ไม่เกี่ยวกับของเสีย" : "แสดงวัตถุดิบทั้งหมด"}
                    </button>
                  ) : null}
                </FormField>
                {selectedWasteIngredient ? (
                  <p className="text-xs text-muted-foreground">
                    สต็อกคงเหลือ: {Number(selectedWasteIngredient.current_stock).toLocaleString(undefined, { maximumFractionDigits: 2 })} {selectedWasteIngredient.unit}
                  </p>
                ) : null}
                <FormField label="จำนวน" hint="ใช้หน่วยฐานเดียวกับวัตถุดิบ">
                  <input className="form-input" type="number" min={0} step="0.1" value={wasteForm.quantity} onChange={(e) => handleWasteChange("quantity", e.target.value)} />
                </FormField>
                <FormField label="เหตุผล" hint="เลือกสาเหตุที่ต้องทิ้ง จะได้สรุปของเสียได้ตรงขึ้น">
                  <select
                    className="form-input"
                    value={wasteForm.reason}
                    onChange={(e) => handleWasteChange("reason", e.target.value as IngredientWasteReason)}
                  >
                    {WASTE_REASON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="อ้างอิงรายการซื้อ (ถ้ามี)" hint="ช่วยคำนวณต้นทุนล็อตนั้น">
                  <select className="form-input" value={wasteForm.purchaseId} onChange={(e) => handleWasteChange("purchaseId", e.target.value)}>
                    <option value="">ไม่ระบุ</option>
                    {recentIntakes.map((intake) => (
                      <option key={intake.id} value={intake.id}>
                        {formatDateTime(intake.created_at)} • {intake.lot_code ? `Lot ${intake.lot_code}` : `${Number(intake.quantity).toLocaleString()} ${intake.purchase_unit}`}
                        {intake.expires_at ? ` • หมดอายุ ${formatDateOnly(intake.expires_at)}` : ""}
                      </option>
                    ))}
                  </select>
                  {recentIntakesLoading ? <p className="text-xs text-muted-foreground mt-1">กำลังโหลดประวัติการซื้อ...</p> : null}
                </FormField>
                <FormField label="วันที่ตัดสต็อก">
                  <input type="datetime-local" className="form-input" value={wasteForm.wastedAt} onChange={(e) => handleWasteChange("wastedAt", e.target.value)} />
                </FormField>
                <FormField label="บันทึกเพิ่มเติม (ไม่บังคับ)">
                  <textarea className="form-input" rows={2} value={wasteForm.note} onChange={(e) => handleWasteChange("note", e.target.value)} />
                </FormField>
              </div>
              {wasteFormError ? <p className="text-sm text-destructive">{wasteFormError}</p> : null}
              {wasteInfo ? (
                <p className="text-sm text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{wasteInfo}</span>
                </p>
              ) : null}
              <button
                type="button"
                className="px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
                disabled={!wasteFormValid || wasteSubmitting}
                onClick={submitWaste}
              >
                {wasteSubmitting ? "กำลังบันทึก..." : "บันทึกการทิ้ง"}
              </button>
            </div>
          </div>

          <div className="stat-card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="section-title text-base">รายการของเสียล่าสุด</h3>
              <span className="text-xs text-muted-foreground">เห็นเฉพาะเจ้าของ/ผู้จัดการ</span>
            </div>
            {wasteLoading && !wasteRecords.length ? (
              <p className="text-sm text-muted-foreground">กำลังโหลดรายการของเสีย...</p>
            ) : wasteRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีรายการของเสีย เมื่อบันทึกการทิ้งแล้วจะแสดงที่นี่</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 pr-4">วันเวลา</th>
                      <th className="py-2 pr-4">วัตถุดิบ</th>
                      <th className="py-2 pr-4">จำนวน</th>
                      <th className="py-2 pr-4">เหตุผล</th>
                      <th className="py-2 pr-4">ต้นทุนสูญเสีย</th>
                      <th className="py-2 pr-4">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wasteRecords.map((record) => (
                      <tr key={record.id} className="border-t">
                        <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(record.wasted_at)}</td>
                        <td className="py-2 pr-4">{ingredientLookup[record.ingredient_id]?.name || record.ingredient_id}</td>
                        <td className="py-2 pr-4">
                          {Number(record.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })} {record.unit || ingredientLookup[record.ingredient_id]?.unit || "หน่วย"}
                        </td>
                        <td className="py-2 pr-4">{WASTE_REASON_LABELS[record.reason]}</td>
                        <td className="py-2 pr-4">{currencyFormatter.format(record.total_cost || 0)}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{record.note || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}

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
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">ของสด / วันหมดอายุ (ถ้ามี)</p>
                  <p className="text-xs text-muted-foreground">
                    ติ๊กช่องนี้ถ้าวัตถุดิบล็อตนี้เป็นของสดหรือมีวันหมดอายุ จะได้คอยเตือนให้ใช้ก่อนหมดอายุ และตามล็อตที่มีปัญหาได้ง่ายขึ้น (ไม่บังคับ)
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={intakeForm.isPerishable}
                    onChange={(e) => handleIntakeChange("isPerishable", e.target.checked)}
                  />
                  มีวันหมดอายุ
                </label>
              </div>
              {intakeForm.isPerishable ? (
                <>
                  <div className="grid md:grid-cols-2 gap-3">
                    <FormField label="รหัส Lot (ไม่บังคับ)" hint="รหัสล็อต/รุ่นที่ติดมากับสินค้า ไว้ตามล็อตเวลามีปัญหา">
                      <input className="form-input" value={intakeForm.lotCode} onChange={(e) => handleIntakeChange("lotCode", e.target.value)} placeholder="เช่น LOT-0425" />
                    </FormField>
                    <FormField label="วันหมดอายุ (ไม่บังคับ)">
                      <input type="date" className="form-input" value={intakeForm.expiresAt} onChange={(e) => handleIntakeChange("expiresAt", e.target.value)} />
                    </FormField>
                    <div className="md:col-span-2">
                      <FormField label="หมายเหตุเพิ่มเติม (เช่น วิธีเก็บ, กลิ่น, สี)">
                        <textarea className="form-input" rows={2} value={intakeForm.expiryNote} onChange={(e) => handleIntakeChange("expiryNote", e.target.value)} />
                      </FormField>
                    </div>
                  </div>
                  {!intakeForm.expiresAt ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      แนะนำให้ใส่วันหมดอายุ ระบบจะได้ช่วยเตือนให้ใช้ของล็อตนี้ก่อน (ไม่บังคับ)
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">ถ้าเป็นของแห้งหรือของที่ไม่มีวันหมดอายุ ข้ามส่วนนี้ได้เลย</p>
              )}
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
