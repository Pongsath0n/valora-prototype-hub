import { ArrowLeft, ListChecks, Receipt } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

/**
 * Canonical Thai labels for the customer order-flow navigation actions.
 * Exported so other screens (e.g. OrderSuccess) reuse the exact same wording.
 */
export const ORDER_NAV_LABELS = {
  back: "ย้อนกลับ",
  editItems: "แก้ไขรายการ",
  status: "ดูสถานะของออเดอร์",
} as const;

type OrderFlowNavProps = {
  /**
   * In-flow path for the "ย้อนกลับ" (back) action. When omitted the button is
   * hidden — we never render a dead/disabled back button (e.g. on the first
   * step there is no valid previous step).
   */
  backTo?: string | null;
  /**
   * Path for the "แก้ไขรายการ" (edit items) action — the menu/cart selection
   * area. Omit once the order has been submitted so it can never mutate an
   * already-created order.
   */
  editItemsTo?: string | null;
  /**
   * Status URL for the "ดูสถานะของออเดอร์" action. Only pass this once an order
   * exists and a public token/status URL is available.
   */
  statusTo?: string | null;
  className?: string;
};

/**
 * Compact, mobile / LINE-in-app-browser friendly navigation row for the public
 * customer order flow. Each action is rendered only when its target is provided
 * — unavailable actions are hidden rather than shown as confusing disabled
 * buttons. Pure navigation: no order/cart mutation happens here.
 */
export default function OrderFlowNav({ backTo, editItemsTo, statusTo, className }: OrderFlowNavProps) {
  if (!backTo && !editItemsTo && !statusTo) return null;

  return (
    <nav aria-label="การนำทางคำสั่งซื้อ" className={cn("flex flex-wrap items-center gap-2", className)}>
      {backTo ? (
        <Link to={backTo} className="bw-nav-btn">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {ORDER_NAV_LABELS.back}
        </Link>
      ) : null}
      {editItemsTo ? (
        <Link to={editItemsTo} className="bw-nav-btn">
          <ListChecks className="h-4 w-4" aria-hidden />
          {ORDER_NAV_LABELS.editItems}
        </Link>
      ) : null}
      {statusTo ? (
        <Link to={statusTo} className="bw-nav-btn">
          <Receipt className="h-4 w-4" aria-hidden />
          {ORDER_NAV_LABELS.status}
        </Link>
      ) : null}
    </nav>
  );
}
