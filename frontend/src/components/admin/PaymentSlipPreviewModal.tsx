import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, X } from "lucide-react";
import type {
  ApiPayment,
  PaymentSlipPreviewResponse,
} from "@/services/storeAdminApi";
import { storeAdminApi } from "@/services/storeAdminApi";

export type PaymentSlipPreviewModalProps = {
  payment: ApiPayment | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (payment: ApiPayment) => Promise<void> | void;
  onReject: (payment: ApiPayment) => Promise<void> | void;
  rejectReason: string;
  onRejectReasonChange: (value: string) => void;
};

export function PaymentSlipPreviewModal({
  payment,
  isOpen,
  onClose,
  onApprove,
  onReject,
  rejectReason,
  onRejectReasonChange,
}: PaymentSlipPreviewModalProps) {
  const [preview, setPreview] = useState<PaymentSlipPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [actionLoading, setActionLoading] = useState<null | "approve" | "reject">(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  useEffect(() => {
    let ignore = false;
    if (!isOpen || !payment) {
      setPreview(null);
      setError("");
      setLoading(false);
      return () => {
        ignore = true;
      };
    }

    async function loadPreview() {
      setLoading(true);
      setError("");
      try {
        const data = await storeAdminApi.getPaymentSlipPreview(payment.id);
        if (!ignore) setPreview(data);
      } catch (err: any) {
        if (!ignore) setError(err?.message || "ไม่สามารถสร้างลิงก์ตัวอย่างได้");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void loadPreview();
    return () => {
      ignore = true;
    };
  }, [isOpen, payment?.id, refreshSignal]);

  const submittedDisplay = useMemo(() => {
    if (!preview?.submitted_at) return "-";
    try {
      return new Date(preview.submitted_at).toLocaleString("th-TH");
    } catch (err) {
      void err;
      return preview.submitted_at;
    }
  }, [preview?.submitted_at]);

  if (!isOpen || !payment) return null;

  const handleRefresh = () => setRefreshSignal((prev) => prev + 1);

  const runAction = async (type: "approve" | "reject") => {
    if (!payment) return;
    setActionLoading(type);
    try {
      if (type === "approve") {
        await onApprove(payment);
      } else {
        await onReject(payment);
      }
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6" onClick={onClose} data-testid="payment-slip-modal">
      <div className="relative flex flex-col w-full max-w-3xl max-h-[90vh] rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          aria-label="ปิด"
          className="absolute right-4 top-4 z-10 rounded-full bg-white/95 p-1 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-12 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Payment</p>
              <h2 className="text-xl font-semibold">#{payment.id}</h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                disabled={loading}
              >
                <RefreshCcw className="h-4 w-4" /> รีเฟรชลิงก์
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                ปิด
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border p-4 text-sm">
              <h3 className="text-base font-semibold">ข้อมูลการชำระเงิน</h3>
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">ออเดอร์</dt>
                  <dd className="font-mono">{payment.order_id}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">ลูกค้า</dt>
                  <dd>{payment.customer_name || "-"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">ยอดโอน</dt>
                  <dd className="font-semibold">฿{Number(payment.amount || 0).toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">ส่งเมื่อ</dt>
                  <dd>{submittedDisplay}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">ไฟล์</dt>
                  <dd>{preview?.file_name || payment.slip_file_name || "-"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">สถานะ</dt>
                  <dd className="capitalize">{payment.status}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border p-4 text-sm">
              <h3 className="text-base font-semibold">การดำเนินการ</h3>
              <label className="mt-3 block text-sm font-medium text-foreground">
                เหตุผลการปฏิเสธ (บังคับเมื่อ Reject)
              </label>
              <textarea
                value={rejectReason}
                onChange={(event) => onRejectReasonChange(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="เช่น ยอดไม่ตรง สลิปหมดอายุ"
              />
              <div className="mt-4 flex flex-col gap-2 md:flex-row">
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={() => void runAction("approve")}
                  disabled={actionLoading === "approve"}
                >
                  {actionLoading === "approve" ? "กำลังอนุมัติ..." : "อนุมัติการชำระเงิน"}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-destructive py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
                  onClick={() => void runAction("reject")}
                  disabled={!rejectReason.trim() || actionLoading === "reject"}
                >
                  {actionLoading === "reject" ? "กำลังปฏิเสธ..." : "ปฏิเสธการชำระเงิน"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            {loading ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                กำลังโหลดตัวอย่างสลิป...
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center gap-2 text-sm text-destructive">
                <p>{error}</p>
                <button
                  type="button"
                  className="underline"
                  onClick={handleRefresh}
                >
                  ลองอีกครั้ง
                </button>
              </div>
            ) : preview?.signed_url ? (
              <div className="space-y-2">
                <img
                  src={preview.signed_url}
                  alt="หลักฐานการโอน"
                  className="max-h-[55vh] w-full rounded-xl object-contain"
                />
                <p className="text-xs text-muted-foreground">
                  ลิงก์หมดอายุภายใน {preview.expires_in ?? 0} วินาที
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">ไม่พบข้อมูลสลิป</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
