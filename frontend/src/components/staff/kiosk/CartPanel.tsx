import { ArrowRight, Minus, Pencil, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatCurrency,
  getItemLineTotal,
  getItemUnitPrice,
  type CartItem,
} from "@/features/staff/kiosk";

type CartPanelProps = {
  cart: CartItem[];
  orderTotal: number;
  hasItems: boolean;
  onAdjustQuantity: (index: number, delta: number) => void;
  onEditItem: (index: number) => void;
  onRemoveItem: (index: number) => void;
  onClearCart: () => void;
  onNext: () => void;
  orderNote: string;
  onOrderNoteChange: (value: string) => void;
  customerName: string;
  onCustomerNameChange: (value: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (value: string) => void;
};

function CartLine({
  item,
  index,
  onAdjustQuantity,
  onEditItem,
  onRemoveItem,
}: {
  item: CartItem;
  index: number;
  onAdjustQuantity: (index: number, delta: number) => void;
  onEditItem: (index: number) => void;
  onRemoveItem: (index: number) => void;
}) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {typeof item.sweetness === "number" ? <span>หวาน {item.sweetness}%</span> : null}
            {item.addons.length > 0 ? (
              <span>{item.addons.map((addon) => `${addon.name} x${addon.quantity}`).join(", ")}</span>
            ) : null}
            {item.note ? <span>โน้ต: {item.note}</span> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-foreground">{formatCurrency(getItemLineTotal(item))}</p>
          <p className="text-[11px] text-muted-foreground">{formatCurrency(getItemUnitPrice(item))} / แก้ว</p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="inline-flex items-center rounded-full border bg-muted px-1 py-0.5 text-xs">
          <button
            type="button"
            className="rounded-full p-1 hover:bg-background"
            aria-label={`ลดจำนวน ${item.name}`}
            onClick={() => onAdjustQuantity(index, -1)}
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-[1.5rem] px-1 text-center font-semibold">{item.quantity}</span>
          <button
            type="button"
            className="rounded-full p-1 hover:bg-background"
            aria-label={`เพิ่มจำนวน ${item.name}`}
            onClick={() => onAdjustQuantity(index, 1)}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onEditItem(index)}>
            <Pencil className="h-3.5 w-3.5" /> แก้ไข
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-destructive"
            onClick={() => onRemoveItem(index)}
          >
            <Trash2 className="h-3.5 w-3.5" /> ลบ
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Step 1 — right column. Sticky cart with editable lines, a prominent running
 * total, optional customer details, and the single primary action to advance
 * to payment.
 */
export default function CartPanel({
  cart,
  orderTotal,
  hasItems,
  onAdjustQuantity,
  onEditItem,
  onRemoveItem,
  onClearCart,
  onNext,
  orderNote,
  onOrderNoteChange,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
}: CartPanelProps) {
  return (
    <aside className="flex flex-col rounded-2xl border bg-card shadow-sm lg:sticky lg:top-6">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground">ตะกร้า</h3>
        </div>
        <span className="text-xs text-muted-foreground">{cart.length} รายการ</span>
      </div>

      {!hasItems ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          ยังไม่มีรายการ เลือกเมนูด้านซ้ายเพื่อเริ่มออเดอร์
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto pr-1">
            {cart.map((item, index) => (
              <CartLine
                key={`${item.productId}-${index}`}
                item={item}
                index={index}
                onAdjustQuantity={onAdjustQuantity}
                onEditItem={onEditItem}
                onRemoveItem={onRemoveItem}
              />
            ))}
          </div>

          <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">ข้อมูลเพิ่มเติม (ถ้ามี)</p>
            <Textarea
              value={orderNote}
              onChange={(event) => onOrderNoteChange(event.target.value)}
              placeholder="โน้ตสำหรับออเดอร์ (ตัวอย่าง: ใส่ชื่อลูกค้าบนแก้ว)"
              className="min-h-[60px] bg-background"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={customerName}
                onChange={(event) => onCustomerNameChange(event.target.value)}
                placeholder="ชื่อลูกค้า (ถ้ามี)"
                className="bg-background"
              />
              <Input
                value={customerPhone}
                onChange={(event) => onCustomerPhoneChange(event.target.value)}
                placeholder="เบอร์โทร"
                inputMode="tel"
                className="bg-background"
              />
            </div>
          </div>
        </div>
      )}

      <div className="mt-auto space-y-3 border-t px-5 py-4">
        <div className="flex items-end justify-between">
          <span className="text-sm font-medium text-muted-foreground">ยอดรวม</span>
          <span className="text-2xl font-extrabold tabular-nums text-foreground">{formatCurrency(orderTotal)}</span>
        </div>
        <Button className="h-11 w-full text-base" disabled={!hasItems} onClick={onNext}>
          ไปขั้นตอนการชำระเงิน
          <ArrowRight className="h-4 w-4" />
        </Button>
        {hasItems ? (
          <button
            type="button"
            onClick={onClearCart}
            className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            ล้างรายการทั้งหมด
          </button>
        ) : null}
      </div>
    </aside>
  );
}
