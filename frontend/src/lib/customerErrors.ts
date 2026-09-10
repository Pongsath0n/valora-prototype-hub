/**
 * Customer-facing error mapping for the canonical V1 self-order flow.
 *
 * Maps backend error codes to safe, Thai-language customer messages.
 * Never exposes SQL, PostgreSQL, Supabase internals, or stack traces.
 */

/** Map a backend error code or message to a customer-facing Thai message. */
export function mapCustomerOrderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const detail = (error as { detail?: { code?: string; message?: string } } | null)?.detail;
  const code = detail?.code ?? raw;

  switch (code) {
    case "customer_name_required":
    case "name_required":
      return "กรุณาระบุชื่อสำหรับการสั่งซื้อ";
    case "invalid_recipe_configuration":
      return "รายการที่เลือกไม่พร้อมให้บริการในขณะนี้ กรุณาเลือกเมนูใหม่อีกครั้ง";
    case "addon_not_available":
      return "ตัวเลือกเพิ่มเติมที่เลือกไม่พร้อมให้บริการ กรุณาตรวจสอบตะกร้าอีกครั้ง";
    case "order_no_generation_exhausted":
    case "order_number_generation_failed":
      return "ไม่สามารถสร้างคำสั่งซื้อได้ในขณะนี้ กรุณาลองอีกครั้ง";
    case "menu_item_not_available":
      return "เมนูนี้ไม่พร้อมให้บริการในขณะนี้";
    case "insufficient_stock":
    case "stock_unavailable":
      return "สินค้าในตะกร้ามีจำนวนไม่เพียงพอ กรุณาตรวจสอบและลอกใหม่";
    case "network":
    case "fetch_failed":
      return "ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบอินเทอร์เน็ตและลองอีกครั้ง";
    default:
      // Generic safe fallback — never expose raw backend internals.
      if (raw && raw.length > 0 && raw.length < 200 && !raw.includes("SQL") && !raw.includes("Postgres") && !raw.includes("Supabase")) {
        return raw;
      }
      return "ไม่สามารถส่งคำสั่งซื้อได้ กรุณาลองอีกครั้ง";
  }
}

/**
 * Map a customer status lookup error to a safe Thai message.
 *
 * Used by the canonical V1 `/order/status` page when fetching by public_token.
 * Never exposes token_required, SQL, Postgres, or Supabase internals.
 */
export function mapCustomerStatusError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const detail = (error as { detail?: { code?: string; message?: string } } | null)?.detail;
  const code = detail?.code ?? raw;

  switch (code) {
    case "order_not_found":
      return "ไม่พบคำสั่งซื้อ";
    case "token_required":
      return "ไม่พบออเดอร์ล่าสุด";
    case "network":
    case "fetch_failed":
      return "ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง";
    default:
      if (raw && raw.length > 0 && raw.length < 200 && !raw.includes("SQL") && !raw.includes("Postgres") && !raw.includes("Supabase") && !raw.includes("token")) {
        return raw;
      }
      return "ไม่สามารถตรวจสอบสถานะได้ในขณะนี้ กรุณาลองอีกครั้ง";
  }
}
