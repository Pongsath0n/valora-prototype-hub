import { ArrowLeft, CheckCircle2, Loader2, QrCode, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  getItemLineTotal,
  type CartItem,
  type PaymentMethod,
} from "@/features/staff/kiosk";

import StoreQrPanel from "./StoreQrPanel";

type PaymentPanelProps = {
  cart: CartItem[];
  orderTotal: number;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  submitting: boolean;
  submitError: string;
  onConfirm: () => void;
  onBack: () => void;
};

const METHOD_OPTIONS: { value: PaymentMethod; title: string; hint: string; Icon: typeof QrCode }[] = [
  { value: "promptpay", title: "PromptPay / QR", hint: "ลูกค้าสแกน QR ร้านและกรอกยอดเอง", Icon: QrCode },
  { value: "cash", title: "เงินสด", hint: "รับเงิน ตรวจเงินทอนก่อนยืนยัน", Icon: Wallet },
];

/**
 * Step 2 — payment. Four clearly separated zones: order summary, payment method
 * selection, method-specific instructions (StoreQrPanel or cash), and the single
 * primary confirm action.
 */
export default function PaymentPanel({
  cart,
  orderTotal,
  paymentMethod,
  onPaymentMethodChange,
  submitting,
  submitError,
  onConfirm,
  onBack,
}: PaymentPanelProps) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">รับชำระเงิน</h2>
          <p className="text-sm text-muted-foreground">ตรวจยอด เลือกวิธีชำระ แล้วยืนยันเมื่อได้รับเงินครบ</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> แก้ไขออเดอร์
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Zone 1 — order summary */}
        <section className="flex flex-col rounded-2xl border bg-card shadow-sm">
          <h3 className="border-b px-5 py-3 text-sm font-semibold text-foreground">สรุปออเดอร์</h3>
          <div className="flex-1 space-y-2 px-5 py-4">
            {cart.map((item, index) => (
              <div key={`${item.productId}-${index}`} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{item.name}</span>
                  <span className="ml-1">x{item.quantity}</span>
                </span>
                <span className="shrink-0 tabular-nums">{formatCurrency(getItemLineTotal(item))}</span>
              </div>
            ))}
          </div>
          <div className="flex items-end justify-between border-t bg-muted/20 px-5 py-4">
            <span className="text-sm font-medium text-muted-foreground">ยอดที่ต้องเก็บ</span>
            <span className="text-2xl font-extrabold tabular-nums text-foreground">{formatCurrency(orderTotal)}</span>
          </div>
        </section>

        {/* Zones 2–4 — method selection, instructions, confirm */}
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {METHOD_OPTIONS.map(({ value, title, hint, Icon }) => {
              const selected = paymentMethod === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onPaymentMethodChange(value)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition",
                    selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-background hover:border-primary/60",
                  )}
                >
                  <Icon className="mb-2 h-5 w-5 text-primary" />
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </button>
              );
            })}
          </div>

          {paymentMethod === "promptpay" ? (
            <StoreQrPanel amount={orderTotal} />
          ) : (
            <div className="rounded-2xl border border-dashed border-primary/40 bg-muted/20 p-5">
              <p className="text-sm text-foreground">เตรียมเงินทอน</p>
              <p className="text-2xl font-bold tabular-nums text-primary">{formatCurrency(orderTotal)}</p>
              <p className="mt-2 text-xs text-muted-foreground">เช็กธนบัตรและยืนยันกับลูกค้าก่อนกดปุ่ม</p>
            </div>
          )}

          {submitError ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {submitError}
            </p>
          ) : null}

          <Button className="h-12 w-full text-base" disabled={submitting} onClick={onConfirm}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            ยืนยันว่าได้รับชำระแล้ว
          </Button>
        </section>
      </div>
    </div>
  );
}
