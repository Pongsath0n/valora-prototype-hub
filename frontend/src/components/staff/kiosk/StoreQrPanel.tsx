import { useEffect, useState } from "react";
import { Loader2, QrCode, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QR_COPY, STORE_QR_CONFIG, formatCurrency } from "@/features/staff/kiosk";

/**
 * PF-01.2: Explicit image lifecycle states.
 *
 * `qrImageUrl` being truthy is NOT equivalent to "QR ready". The image
 * must successfully fire `onLoad` before it is considered ready. This is
 * critical for Safari/iPad where the first payment session can fail to
 * render the QR image (auth session not yet ready, signed URL stale, or
 * Safari caching a failed image request).
 */
type ImageState = "idle" | "loading" | "ready" | "error";

/** Detects Supabase Storage signed URLs (contain `?token=` or `&token=`). */
function isSignedUrl(url: string): boolean {
  return /[?&]token=/.test(url);
}

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
  /** Optional display name/account alias shown under the QR image. */
  displayName?: string | null;
  className?: string;
  /** True while payment settings are loading. Shows a loading state in the QR area. */
  loading?: boolean;
  /** Error message from payment settings load. Shows error + retry in the QR area. */
  error?: string | null;
  /** Retry callback — refetches payment settings only. Must NOT create order/mutate stock. */
  onRetry?: () => void;
};

/**
 * Replaceable store-QR display.
 *
 * This phase intentionally ships a static, amount-less placeholder: no upload,
 * no storage bucket, no payment schema. The single `qrImageUrl` seam is the
 * only thing a later phase needs to wire up to show a real QR.
 *
 * States:
 * 1. settings loading → "กำลังโหลด QR สำหรับชำระเงิน..."
 * 2. settings error → "ไม่สามารถโหลด QR ได้" + "ลองใหม่"
 * 3. qrImageUrl absent (settings loaded, no QR configured) → placeholder
 * 4. qrImageUrl present, image loading → "กำลังโหลด QR สำหรับชำระเงิน..." (img hidden)
 * 5. qrImageUrl present, image ready → QR image visible
 * 6. qrImageUrl present, image error → "ไม่สามารถแสดง QR สำหรับชำระเงินได้" + "ลองโหลด QR อีกครั้ง"
 *
 * PF-01.2 Safari reliability:
 * - On first image error, automatically refetches payment settings ONCE to
 *   obtain a fresh canonical QR URL (new signed token). This recovers the
 *   Safari/iPad first-session failure without a page refresh.
 * - If the automatic retry also fails, shows a manual retry button.
 * - Manual retry refetches settings; for non-signed stable URLs only, applies
 *   a controlled cache-bust nonce to defeat Safari's failed-image cache.
 * - Signed URLs are NEVER mutated client-side (no query param appended).
 * - No timestamp-based cache-bust on normal render.
 * - The broken-image icon is never visible (img is opacity-0 until ready,
 *   and removed from DOM during error state).
 */
export default function StoreQrPanel({
  amount,
  qrImageUrl = STORE_QR_CONFIG.qrImageUrl,
  displayName,
  className,
  loading = false,
  error = null,
  onRetry,
}: StoreQrPanelProps) {
  const [imageState, setImageState] = useState<ImageState>("idle");
  // Auto-retry guard: at most ONE automatic recovery attempt.
  const [autoRetryUsed, setAutoRetryUsed] = useState(false);
  // Controlled retry nonce for non-signed stable URLs ONLY on explicit retry.
  // Never applied on normal render. Never applied to signed URLs.
  const [manualRetryNonce, setManualRetryNonce] = useState(0);

  // Effective img src: qrImageUrl with optional cache-bust nonce for
  // non-signed stable URLs on explicit retry only.
  const effectiveSrc = (() => {
    if (!qrImageUrl) return null;
    if (manualRetryNonce > 0 && !isSignedUrl(qrImageUrl)) {
      const sep = qrImageUrl.includes("?") ? "&" : "?";
      return `${qrImageUrl}${sep}retry=${manualRetryNonce}`;
    }
    return qrImageUrl;
  })();

  // Reset image state when the effective src changes (e.g. after settings
  // refetch produces a new signed URL, or after a manual retry nonce bump).
  useEffect(() => {
    if (effectiveSrc) {
      setImageState("loading");
    } else {
      setImageState("idle");
    }
  }, [effectiveSrc]);

  // Image lifecycle handlers.
  const handleImageLoad = () => {
    setImageState("ready");
  };

  const handleImageError = () => {
    setImageState("error");
    // Automatic recovery: ONE safe retry by refetching payment settings.
    // The refetch produces a fresh canonical QR URL (new signed token),
    // which changes effectiveSrc and triggers a new image load.
    if (!autoRetryUsed && onRetry) {
      setAutoRetryUsed(true);
      onRetry();
    }
  };

  // Manual retry: refetch payment settings + optional cache-bust for
  // non-signed stable URLs. Must NOT create order, clear the walk-in
  // selection, finalize payment, mutate stock, or regenerate the order id.
  const handleManualRetry = () => {
    if (!onRetry) return;
    onRetry();
    // For non-signed stable URLs, apply a controlled nonce to bust Safari's
    // failed-image cache. Signed URLs get a fresh token from the refetch.
    if (qrImageUrl && !isSignedUrl(qrImageUrl)) {
      setManualRetryNonce((n) => n + 1);
    }
    // Reset image state to loading so the <img> re-renders and attempts a
    // fresh load. For signed URLs the refetch produces a new URL (new token)
    // which changes effectiveSrc and triggers the useEffect; for stable URLs
    // the nonce bump changes effectiveSrc. Either way, we also explicitly
    // reset here so the img re-enters the DOM even if the URL is unchanged.
    setImageState("loading");
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-primary/40 bg-muted/20 p-5 text-center",
        className,
      )}
    >
      {loading ? (
        <div className="mx-auto flex h-72 w-72 max-w-[80vw] flex-col items-center justify-center gap-3 rounded-xl border bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm font-medium text-muted-foreground" role="status" aria-live="polite">
            กำลังโหลด QR สำหรับชำระเงิน...
          </p>
        </div>
      ) : error ? (
        <div className="mx-auto flex h-72 w-72 max-w-[80vw] flex-col items-center justify-center gap-3 rounded-xl border bg-background">
          <p className="text-sm font-medium text-destructive" role="alert">
            ไม่สามารถโหลด QR ได้
          </p>
          <p className="text-xs text-muted-foreground">กรุณาลองโหลดการตั้งค่าอีกครั้ง</p>
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" /> ลองใหม่
            </Button>
          ) : null}
        </div>
      ) : !qrImageUrl ? (
        <div className="mx-auto flex h-72 w-72 max-w-[80vw] items-center justify-center overflow-hidden rounded-xl border bg-background">
          <QrCode className="h-20 w-20 text-muted-foreground" aria-hidden />
        </div>
      ) : (
        <div className="relative mx-auto flex h-72 w-72 max-w-[80vw] items-center justify-center overflow-hidden rounded-xl border bg-background">
          {imageState !== "error" ? (
            <img
              key={effectiveSrc}
              src={effectiveSrc ?? undefined}
              alt="QR พร้อมเพย์ของร้าน"
              className={cn(
                "h-full w-full object-contain",
                imageState !== "ready" && "opacity-0",
              )}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          ) : null}
          {imageState === "idle" || imageState === "loading" ? (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
              <p className="text-sm font-medium text-muted-foreground">
                กำลังโหลด QR สำหรับชำระเงิน...
              </p>
            </div>
          ) : null}
          {imageState === "error" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <p className="text-sm font-medium text-destructive" role="alert">
                ไม่สามารถแสดง QR สำหรับชำระเงินได้
              </p>
              <p className="text-xs text-muted-foreground">กรุณาลองโหลด QR อีกครั้ง</p>
              {onRetry ? (
                <Button variant="outline" size="sm" onClick={handleManualRetry}>
                  <RefreshCw className="h-3.5 w-3.5" /> ลองโหลด QR อีกครั้ง
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {displayName ? <p className="mt-3 text-sm font-semibold text-foreground">{displayName}</p> : null}

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
