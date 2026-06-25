import type { StepDescriptor } from "./types";

/**
 * Static configuration for the Staff Kiosk.
 *
 * Everything here is intentionally declarative so it can later be sourced from
 * a per-store / per-tenant settings payload without touching component code.
 */

/** Sentinel category meaning "show all menu items". */
export const ALL_CATEGORY = "__all__";

/** Selectable sweetness levels (percentage). */
export const SWEETNESS_LEVELS = [0, 25, 50, 75, 100] as const;

/** Fallback sweetness when a product's default is missing/invalid. */
export const DEFAULT_SWEETNESS = 100;

/** Wizard steps, in order. Labels are the source of truth for the indicator. */
export const STEPS: StepDescriptor[] = [
  { id: "menu", label: "เลือกเมนู" },
  { id: "payment", label: "ชำระเงิน" },
  { id: "success", label: "สำเร็จ" },
];

/**
 * Replaceable store-QR configuration.
 *
 * This phase ships a static, amount-less placeholder. A future phase can set
 * `qrImageUrl` from store settings (or a Supabase Storage URL) WITHOUT changing
 * StoreQrPanel or any flow code — the component already renders the image when
 * a URL is present and falls back to the placeholder otherwise.
 */
export type StoreQrConfig = {
  /** Future: URL of the store's static PromptPay QR image. Null = placeholder. */
  qrImageUrl: string | null;
};

export const STORE_QR_CONFIG: StoreQrConfig = {
  qrImageUrl: null,
};

/**
 * Customer-facing PromptPay QR copy.
 *
 * The store QR is a static, amount-less QR, so the wording must make the manual
 * steps unambiguous for both staff and customer.
 */
export const QR_COPY = {
  /** Headline: this QR does not embed an amount. */
  title: "QR ร้านแบบไม่ระบุยอด",
  /** Customer instruction. */
  customerInstruction: "ลูกค้าต้องกรอกยอดให้ตรงกับยอดที่แสดง",
  /** Staff verification instruction. */
  staffInstruction: "พนักงานตรวจสลิปก่อนกดยืนยัน",
} as const;
