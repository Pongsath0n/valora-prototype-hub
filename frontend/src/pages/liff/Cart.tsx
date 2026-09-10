import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Coffee, Minus, Plus, Trash2 } from "lucide-react";

import {
  type CartItem,
  getCartItemLineTotal,
  getCartItemUnitPrice,
  getCartItemKey,
  readCart,
  removeCartItem,
  updateCartQuantity,
  reconcileCartWithProductIds,
} from "@/services/cartStorage";
import { customerApi } from "@/services/customerApi";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(value);
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>(() => readCart());
  const [cartNotice, setCartNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function validateCart() {
      const currentCart = readCart();
      if (!currentCart.length) return;
      try {
        const menus = await customerApi.listMenu();
        if (cancelled) return;
        const validIds = new Set(menus.map((menu) => menu.id));
        const { items: filtered, removedCount } = reconcileCartWithProductIds(validIds);
        if (!cancelled && removedCount > 0) {
          setItems(filtered);
          setCartNotice("รายการบางส่วนถูกลบออกเพราะร้านอัปเดตเมนูแล้ว โปรดเลือกเมนูอีกครั้ง");
        }
      } catch {
        // Silently ignore menu fetch issues; submission guard will catch later.
      }
    }
    void validateCart();
    return () => {
      cancelled = true;
    };
  }, []);

  const estimatedTotal = useMemo(
    () => items.reduce((sum, item) => sum + getCartItemLineTotal(item), 0),
    [items],
  );

  function handleQuantityChange(index: number, nextQuantity: number) {
    const updated = updateCartQuantity(index, nextQuantity);
    setItems([...updated]);
  }

  function handleRemove(index: number) {
    const updated = removeCartItem(index);
    setItems([...updated]);
  }

  if (!items.length) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold">ตะกร้าของคุณ</h1>
        <div className="bw-card flex flex-col items-center gap-2 border-dashed p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
            <Coffee className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-base font-semibold">ยังไม่มีสินค้าในตะกร้า</p>
          <p className="text-sm text-muted-foreground">เลือกเมนูจากหน้าหลักเพื่อเริ่มสั่งได้เลย</p>
          <Link to="/order" className="bw-cta mt-2">
            กลับไปเลือกเมนู
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-5 pb-28">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">ตะกร้าของคุณ</h1>
        <p className="text-sm text-muted-foreground">ตรวจสอบรายการก่อนยืนยันคำสั่งซื้อ</p>
      </div>

      {cartNotice ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {cartNotice}
        </div>
      ) : null}

      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={getCartItemKey(item, index)} className="bw-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-bold">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(item.price)} / แก้ว (ไม่รวมตัวเลือก)
                </p>
                {item.options?.sweetness !== undefined ? (
                  <span className="mt-2 mr-1 inline-flex rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                    ความหวาน {item.options.sweetness}%
                  </span>
                ) : null}
                {item.options?.addons?.map((addon, idx) => (
                  <span
                    key={`${addon.addon_id}-${idx}`}
                    className="mt-2 mr-1 inline-flex rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground"
                  >
                    เพิ่มช็อต x{addon.quantity} (+
                    {formatCurrency((Number(addon.price ?? 0) || 0) * Math.max(1, addon.quantity))}/แก้ว)
                  </span>
                ))}
                {item.note ? (
                  <p className="mt-2 text-xs text-muted-foreground">หมายเหตุ: {item.note}</p>
                ) : null}
                <p className="mt-2 text-xs font-semibold">
                  ประมาณ {formatCurrency(getCartItemUnitPrice(item))} / แก้ว (รวมตัวเลือก)
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                aria-label={`ลบ ${item.name}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="inline-flex items-center gap-1 rounded-full border bg-secondary/60 p-1">
                <button
                  type="button"
                  className="bw-stepper-btn"
                  onClick={() => handleQuantityChange(index, items[index].quantity - 1)}
                  aria-label="ลดจำนวน"
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </button>
                <span className="w-8 text-center text-base font-bold tabular-nums">{item.quantity}</span>
                <button
                  type="button"
                  className="bw-stepper-btn"
                  onClick={() => handleQuantityChange(index, items[index].quantity + 1)}
                  aria-label="เพิ่มจำนวน"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <p className="text-base font-bold text-primary">
                {formatCurrency(getCartItemLineTotal(item))}
              </p>
            </div>
          </div>
        ))}
      </div>

      <Link to="/order" className="bw-btn-outline text-sm">
        เลือกเมนูเพิ่ม
      </Link>

      <div className="bw-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">ยอดรวมโดยประมาณ (สำหรับลูกค้า)</p>
          <p className="text-xl font-bold text-primary">{formatCurrency(estimatedTotal)}</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          ราคาจริงอาจมีการปรับโดยร้านเมื่อตรวจสอบคำสั่งซื้อ
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <div className="leading-tight">
            <p className="text-[11px] text-muted-foreground">ยอดรวม</p>
            <p className="text-lg font-bold text-primary tabular-nums">{formatCurrency(estimatedTotal)}</p>
          </div>
          <Link to="/order/confirm" className="bw-cta flex-1">
            ไปยืนยันคำสั่งซื้อ
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
