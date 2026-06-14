import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  type CartItem,
  getCartItemLineTotal,
  getCartItemUnitPrice,
  getCartItemKey,
  readCart,
  removeCartItem,
  updateCartQuantity,
} from "@/services/cartStorage";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(value);
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>(() => readCart());

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
        <h1 className="text-2xl font-semibold">ตะกร้า</h1>
        <div className="rounded-2xl border border-dashed bg-white/70 p-6 text-center shadow-sm">
          <p className="text-base font-medium text-muted-foreground">
            ยังไม่มีสินค้าในตะกร้า
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            เลือกเมนูจากหน้าหลักเพื่อเริ่มสั่งได้เลย
          </p>
          <Link
            to="/liff/menu"
            className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            กลับไปเลือกเมนู
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">ตะกร้า</h1>
        <p className="text-sm text-muted-foreground">
          ตรวจสอบรายการก่อนยืนยันคำสั่งซื้อ
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={getCartItemKey(item, index)}
            className="rounded-2xl border bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-semibold">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(item.price)} / แก้ว (ไม่รวมตัวเลือก)
                </p>
                {item.options?.sweetness !== undefined ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    ความหวาน: {item.options.sweetness}%
                  </p>
                ) : null}
                {item.options?.addons?.map((addon, idx) => (
                  <p key={`${addon.addon_id}-${idx}`} className="text-xs text-muted-foreground">
                    เพิ่มช็อต x{addon.quantity} (+
                    {formatCurrency((Number(addon.price ?? 0) || 0) * Math.max(1, addon.quantity))}
                    /แก้ว)
                  </p>
                ))}
                {item.note ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    หมายเหตุ: {item.note}
                  </p>
                ) : null}
                <p className="mt-2 text-xs font-semibold text-foreground">
                  ประมาณ {formatCurrency(getCartItemUnitPrice(item))} / แก้ว (รวมตัวเลือก)
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="text-sm font-medium text-destructive"
              >
                ลบ
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="inline-flex items-center rounded-full border bg-muted px-1">
                <button
                  type="button"
                  className="px-3 py-1 text-lg leading-none"
                  onClick={() => handleQuantityChange(index, items[index].quantity - 1)}
                  aria-label="ลดจำนวน"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(event) =>
                    handleQuantityChange(index, Number(event.target.value))
                  }
                  className="w-12 border-none bg-transparent text-center text-base font-semibold focus:outline-none"
                />
                <button
                  type="button"
                  className="px-3 py-1 text-lg leading-none"
                  onClick={() => handleQuantityChange(index, items[index].quantity + 1)}
                  aria-label="เพิ่มจำนวน"
                >
                  +
                </button>
              </div>
              <p className="text-base font-semibold">
                {formatCurrency(getCartItemLineTotal(item))}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">ยอดรวมโดยประมาณ (สำหรับลูกค้า)</p>
          <p className="text-lg font-semibold">{formatCurrency(estimatedTotal)}</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          ราคาจริงอาจมีการปรับโดยร้านเมื่อตรวจสอบคำสั่งซื้อ
        </p>
      </div>

      <div className="space-y-3">
        <Link
          to="/liff/menu"
          className="inline-flex w-full items-center justify-center rounded-full border border-primary/40 px-4 py-2 text-sm font-semibold text-primary"
        >
          เลือกเมนูเพิ่ม
        </Link>
        <Link
          to="/liff/confirm"
          className="inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          ไปยืนยันคำสั่งซื้อ
        </Link>
      </div>
    </div>
  );
}
