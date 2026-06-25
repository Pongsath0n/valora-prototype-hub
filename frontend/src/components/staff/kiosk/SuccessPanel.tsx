import { Link } from "react-router-dom";
import { CheckCircle2, ListOrdered, Repeat } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ApiOrder } from "@/services/storeAdminApi";
import { formatCurrency, type PaymentMethod } from "@/features/staff/kiosk";

type SuccessPanelProps = {
  order: ApiOrder;
  fallbackTotal: number;
  fallbackMethod: PaymentMethod;
  onReset: () => void;
};

const METHOD_LABELS: Record<string, string> = {
  promptpay: "PromptPay / QR",
  cash: "เงินสด",
};

function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

/**
 * Step 3 — success. Clean, centered confirmation focused on the two next
 * actions: go to the order queue, or start a fresh order.
 */
export default function SuccessPanel({ order, fallbackTotal, fallbackMethod, onReset }: SuccessPanelProps) {
  const orderNo = order.order_no || order.order_number || order.id;
  const total = order.total_amount ?? fallbackTotal;
  const method = methodLabel(order.latest_payment?.method ?? fallbackMethod);

  return (
    <div className="mx-auto w-full max-w-md text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
        <CheckCircle2 className="h-9 w-9 text-emerald-600" />
      </div>
      <h2 className="text-2xl font-bold text-foreground">ส่งเข้าคิวเรียบร้อย</h2>
      <p className="mt-1 text-sm text-muted-foreground">บันทึกออเดอร์และส่งเข้าคิวให้ทีมเตรียมแล้ว</p>

      <dl className="mt-6 space-y-3 rounded-2xl border bg-card p-5 text-left shadow-sm">
        <div className="flex items-center justify-between">
          <dt className="text-sm text-muted-foreground">หมายเลขออเดอร์</dt>
          <dd className="text-lg font-bold text-foreground">{orderNo}</dd>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <dt className="text-sm text-muted-foreground">ยอดรวมที่ชำระ</dt>
          <dd className="text-lg font-bold tabular-nums text-foreground">{formatCurrency(total)}</dd>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <dt className="text-sm text-muted-foreground">วิธีชำระเงิน</dt>
          <dd className="font-semibold text-foreground">{method}</dd>
        </div>
      </dl>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Button asChild className="h-11">
          <Link to="/staff/orders">
            <ListOrdered className="h-4 w-4" /> ไปคิวออเดอร์
          </Link>
        </Button>
        <Button variant="outline" className="h-11" onClick={onReset}>
          <Repeat className="h-4 w-4" /> รับออเดอร์ใหม่
        </Button>
      </div>
    </div>
  );
}
