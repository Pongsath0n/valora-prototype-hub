import type { OverheadCategory, OverheadPeriod } from "@/services/storeAdminApi";

/**
 * Thai-first display labels for overhead expenses. Raw enum values
 * (rent / monthly / per_cup …) must never be shown to the cafe owner —
 * always map through these helpers.
 */
export const OVERHEAD_CATEGORY_LABELS: Record<OverheadCategory, string> = {
  rent: "ค่าเช่า",
  water: "ค่าน้ำ",
  electricity: "ค่าไฟ",
  internet: "ค่าอินเทอร์เน็ต",
  labor: "ค่าแรง",
  equipment: "ค่าเสื่อมอุปกรณ์",
  transport: "ค่าขนส่ง",
  marketing: "การตลาด",
  other: "อื่น ๆ",
};

export const OVERHEAD_PERIOD_LABELS: Record<OverheadPeriod, string> = {
  daily: "รายวัน",
  weekly: "รายสัปดาห์",
  monthly: "รายเดือน",
};

export function overheadCategoryLabel(value: string | null | undefined): string {
  if (!value) return OVERHEAD_CATEGORY_LABELS.other;
  return OVERHEAD_CATEGORY_LABELS[value as OverheadCategory] ?? value;
}

export function overheadPeriodLabel(value: string | null | undefined): string {
  if (!value) return OVERHEAD_PERIOD_LABELS.monthly;
  return OVERHEAD_PERIOD_LABELS[value as OverheadPeriod] ?? value;
}

const bahtWhole = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

const bahtPrecise = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 2,
});

const cupsFormatter = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });

/** Format a baht amount; returns an em dash when the value is missing/non-finite. */
export function formatBaht(value: number | null | undefined, precise = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return (precise ? bahtPrecise : bahtWhole).format(value);
}

/** Format a whole-cup count (rounds up — you cannot break even on a fraction of a cup). */
export function formatCups(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return cupsFormatter.format(Math.ceil(value));
}
