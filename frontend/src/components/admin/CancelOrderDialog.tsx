import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatOrderStatus, formatPaymentStatus, formatTHB } from "@/lib/format";

/**
 * Minimal, already-loaded order fields needed to confirm a Staff cancellation.
 * Nothing here is fetched — the caller passes what the Staff UI already shows.
 */
export type CancelOrderTarget = {
  id?: string;
  order_no?: string | null;
  customer_name?: string | null;
  status?: string | null;
  payment_status?: string | null;
  total_amount?: number | null;
};

type CancelOrderDialogProps = {
  open: boolean;
  order: CancelOrderTarget | null;
  /** Called only when the Staff explicitly confirms the cancellation. */
  onConfirm: () => void;
  /** Called when the dialog is dismissed (Cancel button, ESC, overlay click). */
  onClose: () => void;
  submitting?: boolean;
};

/**
 * Confirmation step shown BEFORE a real `status: "cancelled"` request is sent.
 * Prevents accidental one-click cancellation. The backend guard remains the
 * final authority; this dialog only guards against human error in the Staff UI.
 */
export function CancelOrderDialog({ open, order, onConfirm, onClose, submitting }: CancelOrderDialogProps) {
  const orderLabel = order?.order_no || (order?.id ? `#${order.id}` : "-");

  const detailRows: { label: string; value: string }[] = [
    { label: "เลขออเดอร์", value: orderLabel },
  ];
  if (order?.customer_name) {
    detailRows.push({ label: "ลูกค้า", value: order.customer_name });
  }
  if (order?.status) {
    detailRows.push({ label: "สถานะออเดอร์ปัจจุบัน", value: formatOrderStatus(order.status) });
  }
  if (order?.payment_status) {
    detailRows.push({ label: "สถานะการชำระเงิน", value: formatPaymentStatus(order.payment_status) });
  }
  if (typeof order?.total_amount === "number") {
    detailRows.push({ label: "ยอดรวม", value: formatTHB(order.total_amount) });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Closing the dialog (ESC / overlay / Cancel) must NEVER submit.
        if (!next) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ยืนยันการยกเลิกออเดอร์</AlertDialogTitle>
          <AlertDialogDescription>
            คุณกำลังจะยกเลิกออเดอร์ {orderLabel} การดำเนินการนี้จะเปลี่ยนสถานะออเดอร์เป็น “ยกเลิก”
            ควรใช้เฉพาะออเดอร์ที่ยังไม่ชำระเงินหรือยังไม่มีสลิปเท่านั้น
          </AlertDialogDescription>
        </AlertDialogHeader>

        <dl className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          {detailRows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3 py-0.5">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-medium text-foreground tabular-nums text-right">{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="text-xs text-amber-700">
          คำเตือน: การยกเลิกจะเปลี่ยนสถานะออเดอร์และไม่ควรใช้กับออเดอร์ที่ชำระเงินแล้วหรือมีสลิปจริงแล้ว
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={submitting}>
            กลับไปตรวจสอบ
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={submitting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? "กำลังยกเลิก..." : "ยืนยันยกเลิกออเดอร์"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default CancelOrderDialog;
