import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { customerApi, type CustomerMenuItem } from "@/services/customerApi";
import { addCartItem, type CartItemOptions } from "@/services/cartStorage";

const SWEETNESS_LEVELS = [0, 25, 50, 75, 100] as const;

function sanitizeSweetness(value: number | null | undefined): number | undefined {
  if (value == null) return undefined;
  return SWEETNESS_LEVELS.includes(value as (typeof SWEETNESS_LEVELS)[number]) ? value : undefined;
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

  useEffect(() => {
    if (!id) {
      setMenu(null);
      return;
    }
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
    nav("/liff/cart");
  }

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">กำลังโหลดรายละเอียดเมนู...</div>;
  }
  if (error) {
    return (
      <div className="p-4 text-sm text-red-600">
        <p>{error}</p>
        <button
          type="button"
          className="mt-3 rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => {
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
          }}
        >
          ลองใหม่
        </button>
      </div>
    );
  }
  if (!menu) {
    return (
      <div className="p-4 text-sm">
        <p>ไม่พบข้อมูลเมนู</p>
        <button
          type="button"
          className="mt-3 rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => nav("/liff/menu")}
        >
          กลับไปหน้าเมนู
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4 p-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold">{menu.name}</h1>
        {menu.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{menu.description}</p>
        ) : null}
        <p className="mt-4 text-lg font-semibold">฿{menu.price.toLocaleString()}</p>
      </div>

      <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
        <label className="text-sm font-medium">จำนวนแก้ว</label>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          className="form-input"
        />
      </div>

      {menu.allow_sweetness ? (
        <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">ระดับความหวาน</label>
            <span className="text-xs text-muted-foreground">เลือกได้ 0-100%</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SWEETNESS_LEVELS.map((level) => (
              <button
                type="button"
                key={level}
                onClick={() => setSweetness(level)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  sweetness === level
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted text-muted-foreground hover:border-primary/40"
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
        <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">เพิ่มช็อต</p>
              <p className="text-xs text-muted-foreground">
                +{extraShotAddon.price?.toLocaleString("th-TH", { minimumFractionDigits: 0 }) ?? 0} บาท/ช็อต · สูงสุด {maxExtraShot} ช็อต
              </p>
            </div>
            <div className="inline-flex items-center rounded-full border bg-muted px-1">
              <button
                type="button"
                className="px-3 py-1 text-lg leading-none"
                onClick={() => setExtraShotQty((prev) => Math.max(0, prev - 1))}
                aria-label="ลดจำนวนช็อต"
              >
                −
              </button>
              <input
                type="number"
                min={0}
                max={maxExtraShot}
                value={extraShotQty}
                onChange={(event) => {
                  const next = Math.max(0, Number(event.target.value) || 0);
                  setExtraShotQty(Math.min(next, maxExtraShot));
                }}
                className="w-12 border-none bg-transparent text-center text-base font-semibold focus:outline-none"
              />
              <button
                type="button"
                className="px-3 py-1 text-lg leading-none"
                onClick={() => setExtraShotQty((prev) => Math.min(maxExtraShot, prev + 1))}
                aria-label="เพิ่มจำนวนช็อต"
              >
                +
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
        <label className="text-sm font-medium">หมายเหตุ (ถ้ามี)</label>
        <textarea
          className="form-input"
          rows={3}
          placeholder="เช่น เพิ่มความหวาน เพิ่มช็อต"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">ราคารวมโดยประมาณ / แก้ว</span>
          <span className="text-lg font-semibold">฿{estimatedUnitPrice.toLocaleString()}</span>
        </div>
        {extraShotQty > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">รวมราคาช็อตเพิ่มเติมแล้ว</p>
        ) : null}
      </div>

      {feedback ? <p className="text-sm text-green-600">{feedback}</p> : null}

      <button
        className="w-full rounded-full bg-primary px-4 py-3 text-base font-semibold text-primary-foreground"
        onClick={addToCart}
      >
        เพิ่มลงตะกร้า
      </button>
      <button
        className="w-full rounded-full border px-4 py-3 text-base font-semibold"
        onClick={() => nav("/liff/menu")}
      >
        ดูเมนูอื่น
      </button>
    </div>
  );
}
