import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CustomerMenuItem } from "@/services/customerApi";
import {
  SWEETNESS_LEVELS,
  formatCurrency,
  getDraftLineTotal,
  getDraftUnitPrice,
  type DraftItem,
} from "@/features/staff/kiosk";

type ItemOptionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: CustomerMenuItem | null;
  draft: DraftItem | null;
  isEditing: boolean;
  onIncrementQuantity: () => void;
  onDecrementQuantity: () => void;
  onSweetnessChange: (level: number) => void;
  onNoteChange: (note: string) => void;
  onAddonQuantityChange: (addonId: string, quantity: number) => void;
  onConfirm: () => void;
};

/**
 * Modal for configuring a single line item: quantity, sweetness, add-ons and a
 * per-cup note. Fully controlled by the kiosk hook — it renders the draft and
 * forwards every change/commit upward.
 */
export default function ItemOptionsDialog({
  open,
  onOpenChange,
  product,
  draft,
  isEditing,
  onIncrementQuantity,
  onDecrementQuantity,
  onSweetnessChange,
  onNoteChange,
  onAddonQuantityChange,
  onConfirm,
}: ItemOptionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{product ? `ปรับ ${product.name}` : "ปรับรายการ"}</DialogTitle>
          <DialogDescription>ปรับจำนวน ระดับความหวาน ตัวเลือกเพิ่มเติม และโน้ตสำหรับรายการนี้</DialogDescription>
        </DialogHeader>

        {product && draft ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-muted/30 p-3">
              <span className="text-sm font-medium">จำนวน</span>
              <div className="inline-flex items-center rounded-full border bg-background px-2">
                <button type="button" className="rounded-full p-2" aria-label="ลดจำนวน" onClick={onDecrementQuantity}>
                  <Minus className="h-4 w-4" />
                </button>
                <span className="px-3 text-lg font-semibold">{draft.quantity}</span>
                <button type="button" className="rounded-full p-2" aria-label="เพิ่มจำนวน" onClick={onIncrementQuantity}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {product.allow_sweetness ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">ระดับความหวาน</p>
                <div className="flex flex-wrap gap-2">
                  {SWEETNESS_LEVELS.map((level) => (
                    <Button
                      key={level}
                      type="button"
                      variant={draft.sweetness === level ? "default" : "outline"}
                      onClick={() => onSweetnessChange(level)}
                      size="sm"
                    >
                      {level}%
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {product.addons.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">ตัวเลือกเสริม</p>
                <div className="space-y-2">
                  {product.addons.map((addon) => {
                    const currentQuantity = draft.addons[addon.addon_id] ?? 0;
                    const maxQuantity = addon.max_quantity ?? undefined;
                    const canIncrease = maxQuantity == null || currentQuantity < maxQuantity;
                    return (
                      <div
                        key={addon.addon_id}
                        className="flex items-center justify-between rounded-xl border bg-background px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">{addon.name}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(addon.price)}</p>
                        </div>
                        <div className="inline-flex items-center rounded-full border bg-muted/40 px-2">
                          <button
                            type="button"
                            className="rounded-full p-1"
                            aria-label={`ลด ${addon.name}`}
                            onClick={() => onAddonQuantityChange(addon.addon_id, currentQuantity - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="px-2 text-sm font-semibold">{currentQuantity}</span>
                          <button
                            type="button"
                            className="rounded-full p-1"
                            aria-label={`เพิ่ม ${addon.name}`}
                            disabled={!canIncrease}
                            onClick={() => onAddonQuantityChange(addon.addon_id, currentQuantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <Textarea
              value={draft.note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="โน้ตสำหรับแก้วนี้ (เช่น ใส่น้ำแข็งน้อย)"
            />

            <div className="rounded-xl bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span>ราคาต่อแก้ว</span>
                <span className="font-semibold">{formatCurrency(getDraftUnitPrice(product, draft))}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>รวมทั้งหมด</span>
                <span className="text-lg font-bold text-foreground">
                  {formatCurrency(getDraftLineTotal(product, draft))}
                </span>
              </div>
            </div>

            <Button className="w-full" onClick={onConfirm}>
              {isEditing ? "บันทึกการแก้ไข" : "เพิ่มลงรายการ"}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
