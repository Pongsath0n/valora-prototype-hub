import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Coffee, Minus, Plus } from "lucide-react";
import { customerApi, type CustomerMenuItem } from "@/services/customerApi";
import { addCartItem, type CartItemOptions } from "@/services/cartStorage";

const SWEETNESS_LEVELS = [0, 25, 50, 75, 100] as const;

function sanitizeSweetness(value: number | null | undefined): number | undefined {
  if (value == null) return undefined;
  return SWEETNESS_LEVELS.includes(value as (typeof SWEETNESS_LEVELS)[number]) ? value : undefined;
}

function formatBaht(value: number): string {
  return `฿${value.toLocaleString("th-TH")}`;
}

export default function MenuDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [menu, setMenu] = useState<CustomerMenuItem | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [sweetness, setSweetness] = useState<number | undefined>(undefined);
  const [extraShotQty, setExtraShotQty] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  function loadDetail() {
    if (!id) return;
    setLoading(true);
    setError(null);
    customerApi
      .getMenuDetail(id)
      .then((m) => setMenu(m))
      .catch((e: any) => {
        setError(e?.message || "ไม่สามารถโหลดรายละเอียดเมนูได้");
        setMenu(null);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!id) {
      setMenu(null);
      return;
    }
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!menu) {
      setSweetness(undefined);
      setExtraShotQty(0);
      return;
    }
    if (menu.allow_sweetness) {
      setSweetness(sanitizeSweetness(menu.default_sweetness) ?? 100);
    } else {
      setSweetness(undefined);
    }
    setExtraShotQty(0);
  }, [menu?.id]);

  const extraShotAddon = useMemo(() => {
    if (!menu) return null;
    return (
      menu.addons.find(
        (addon) => addon && (addon.code === "extra_shot" || addon.addon_type === "extra_shot"),
      ) ?? null
    );
  }, [menu]);

  const maxExtraShot = useMemo(() => {
    if (!extraShotAddon) return 0;
    const parsed = Number(extraShotAddon.max_quantity ?? 0);
    return parsed > 0 ? Math.floor(parsed) : 1;
  }, [extraShotAddon]);

  useEffect(() => {
    if (!extraShotAddon) {
      setExtraShotQty(0);
      return;
    }
    setExtraShotQty((prev) => Math.min(Math.max(0, prev), maxExtraShot));
  }, [extraShotAddon, maxExtraShot]);

  const estimatedUnitPrice = useMemo(() => {
    if (!menu) return 0;
    const extraShotTotal = extraShotAddon ? (extraShotAddon.price || 0) * extraShotQty : 0;
    return menu.price + extraShotTotal;
  }, [menu, extraShotAddon, extraShotQty]);

  const lineTotal = estimatedUnitPrice * Math.max(1, qty);

  function addToCart() {
    if (!menu) return;
    const safeQty = Math.max(1, Number(qty) || 1);
    const sweetnessValue = menu.allow_sweetness ? sweetness : undefined;
    const trimmedNote = note.trim();
    const addonSelections = extraShotAddon && extraShotQty > 0
      ? [
          {
            addon_id: extraShotAddon.addon_id,
            code: extraShotAddon.code,
            name: extraShotAddon.name,
            price: extraShotAddon.price,
            quantity: extraShotQty,
          },
        ]
      : undefined;
    const options: CartItemOptions | undefined = (() => {
      const payload: CartItemOptions = {};
      if (sweetnessValue !== undefined) {
        payload.sweetness = sweetnessValue;
      }
      if (addonSelections) {
        payload.addons = addonSelections;
      }
      if (trimmedNote) {
        payload.note = trimmedNote;
      }
      return Object.keys(payload).length > 0 ? payload : undefined;
    })();
    addCartItem({
      productId: menu.id,
      name: menu.name,
      price: menu.price,
      quantity: safeQty,
      note: trimmedNote || undefined,
      ...(options ? { options } : {}),
    });
    setFeedback("เพิ่มสินค้าในตะกร้าแล้ว");
    nav("/order/cart");
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-5">
        <div className="bw-card aspect-video w-full animate-pulse bg-muted" />
        <div className="bw-card h-24 animate-pulse bg-muted/60" />
        <div className="bw-card h-32 animate-pulse bg-muted/60" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        <div className="bw-card border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p>{error}</p>
          <button type="button" className="bw-cta mt-3" onClick={loadDetail}>
            ลองใหม่อีกครั้ง
          </button>
        </div>
      </div>
    );
  }
  if (!menu) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        <div className="bw-card p-6 text-center">
          <p className="text-base font-semibold">ไม่พบข้อมูลเมนู</p>
          <button type="button" className="bw-cta mt-4" onClick={() => nav("/order")}>
            กลับไปหน้าเมนู
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-5 pb-28">
      <button
        type="button"
        onClick={() => nav("/order")}
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        กลับไปเลือกเมนู
      </button>

      <div className="space-y-4">
        <div className="bw-card overflow-hidden p-0">
          <div className="aspect-video w-full bg-secondary">
            {menu.image_url ? (
              <img
                src={menu.image_url}
                alt={menu.name}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-primary/50">
                <Coffee className="h-9 w-9" aria-hidden />
                <span className="text-xs">ไม่มีรูป</span>
              </div>
            )}
          </div>
          <div className="space-y-2 p-4">
            <h1 className="text-xl font-bold leading-snug">{menu.name}</h1>
            {menu.description ? (
              <p className="text-sm text-muted-foreground">{menu.description}</p>
            ) : null}
            <p className="text-lg font-bold text-primary">{formatBaht(menu.price)}</p>
          </div>
        </div>

        <div className="bw-card flex items-center justify-between p-4">
          <span className="text-sm font-semibold">จำนวนแก้ว</span>
          <div className="inline-flex items-center gap-1 rounded-full border bg-secondary/60 p-1">
            <button
              type="button"
              className="bw-stepper-btn"
              onClick={() => setQty((prev) => Math.max(1, prev - 1))}
              aria-label="ลดจำนวน"
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <span className="w-8 text-center text-base font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              className="bw-stepper-btn"
              onClick={() => setQty((prev) => prev + 1)}
              aria-label="เพิ่มจำนวน"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {menu.allow_sweetness ? (
          <div className="bw-card space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">ระดับความหวาน</span>
              <span className="text-xs text-muted-foreground">เลือกได้ 0–100%</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {SWEETNESS_LEVELS.map((level) => (
                <button
                  type="button"
                  key={level}
                  onClick={() => setSweetness(level)}
                  className={`flex min-h-[44px] items-center justify-center rounded-xl border text-sm font-semibold transition-colors ${
                    sweetness === level
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border bg-secondary/50 text-secondary-foreground hover:bg-secondary"
                  }`}
                >
                  {level}%
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              ค่าเริ่มต้น {sanitizeSweetness(menu.default_sweetness) ?? 100}%
            </p>
          </div>
        ) : null}

        {extraShotAddon ? (
          <div className="bw-card flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">เพิ่มช็อต</p>
              <p className="text-xs text-muted-foreground">
                +{formatBaht(extraShotAddon.price || 0)}/ช็อต · สูงสุด {maxExtraShot} ช็อต
              </p>
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border bg-secondary/60 p-1">
              <button
                type="button"
                className="bw-stepper-btn"
                onClick={() => setExtraShotQty((prev) => Math.max(0, prev - 1))}
                aria-label="ลดจำนวนช็อต"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span className="w-8 text-center text-base font-bold tabular-nums">{extraShotQty}</span>
              <button
                type="button"
                className="bw-stepper-btn"
                onClick={() => setExtraShotQty((prev) => Math.min(maxExtraShot, prev + 1))}
                aria-label="เพิ่มจำนวนช็อต"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        ) : null}

        <div className="bw-card space-y-2 p-4">
          <label className="text-sm font-semibold" htmlFor="item-note">
            หมายเหตุ (ถ้ามี)
          </label>
          <textarea
            id="item-note"
            className="bw-input"
            rows={3}
            placeholder="เช่น ไม่หวานมาก เพิ่มน้ำแข็ง"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {feedback ? <p className="text-sm font-medium text-success">{feedback}</p> : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <div className="leading-tight">
            <p className="text-[11px] text-muted-foreground">ราคารวมโดยประมาณ</p>
            <p className="text-lg font-bold text-primary tabular-nums">{formatBaht(lineTotal)}</p>
          </div>
          <button type="button" className="bw-cta flex-1" onClick={addToCart}>
            เพิ่มลงตะกร้า
          </button>
        </div>
      </div>
    </div>
  );
}
