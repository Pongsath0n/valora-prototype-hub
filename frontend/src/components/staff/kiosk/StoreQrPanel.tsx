import { QrCode } from "lucide-react";

import { cn } from "@/lib/utils";
import { QR_COPY, STORE_QR_CONFIG, formatCurrency } from "@/features/staff/kiosk";

type StoreQrPanelProps = {
  /** Amount the customer must enter manually (the store QR has no embedded amount). */
  amount: number;
  /**
   * Optional override for the store QR image source.
   * Defaults to STORE_QR_CONFIG.qrImageUrl. When null/undefined a static
   * placeholder is shown. A future phase can pass a real URL (e.g. from store
   * settings or object storage) WITHOUT any other change to this component.
   */
  qrImageUrl?: string | null;
  className?: string;
};

/**
 * Replaceable store-QR display.
 *
 * This phase intentionally ships a static, amount-less placeholder: no upload,
 * no storage bucket, no payment schema. The single `qrImageUrl` seam is the
 * only thing a later phase needs to wire up to show a real QR.
 */
export default function StoreQrPanel({
  amount,
  qrImageUrl = STORE_QR_CONFIG.qrImageUrl,
  className,
}: StoreQrPanelProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-primary/40 bg-muted/20 p-5 text-center",
        className,
      )}
    >
      <div className="mx-auto flex h-44 w-44 items-center justify-center overflow-hidden rounded-xl border bg-background">
        {qrImageUrl ? (
          <img src={qrImageUrl} alt="QR พร้อมเพย์ของร้าน" className="h-full w-full object-contain" />
        ) : (
          <QrCode className="h-16 w-16 text-muted-foreground" aria-hidden />
        )}
      </div>

      <p className="mt-4 text-sm font-semibold text-foreground">{QR_COPY.title}</p>

      <div className="mt-2 inline-flex items-baseline gap-2 rounded-lg bg-primary/10 px-3 py-1">
        <span className="text-xs text-muted-foreground">ยอดที่ต้องชำระ</span>
        <span className="text-lg font-bold tabular-nums text-primary">{formatCurrency(amount)}</span>
      </div>

      <ul className="mx-auto mt-3 max-w-xs space-y-1 text-xs text-muted-foreground">
        <li>{QR_COPY.customerInstruction}</li>
        <li>{QR_COPY.staffInstruction}</li>
      </ul>
    </div>
  );
}
