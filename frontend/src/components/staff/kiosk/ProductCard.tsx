import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CustomerMenuItem } from "@/services/customerApi";
import { formatCurrency } from "@/features/staff/kiosk";

type ProductCardProps = {
  product: CustomerMenuItem;
  onSelect: (product: CustomerMenuItem) => void;
};

/**
 * Compact, scannable, single-tap product card. The whole card is the add
 * affordance so staff can build orders quickly on a laptop/trackpad.
 */
export default function ProductCard({ product, onSelect }: ProductCardProps) {
  const hasAddons = product.addons.length > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      aria-label={`เพิ่ม ${product.name}`}
      className={cn(
        "group flex h-full flex-col rounded-xl border bg-card p-3 text-left shadow-sm transition",
        "hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">{product.name}</h3>
        <span className="shrink-0 text-sm font-bold text-primary">{formatCurrency(product.price)}</span>
      </div>

      {product.description ? (
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{product.description}</p>
      ) : null}

      <div className="mt-auto flex items-center justify-between pt-3 text-xs text-muted-foreground">
        <span className="truncate">
          {product.category ?? ""}
          {hasAddons ? (product.category ? " · ปรับได้" : "ปรับได้") : ""}
        </span>
        <span className="inline-flex items-center gap-1 font-medium text-primary transition group-hover:gap-1.5">
          <Plus className="h-3.5 w-3.5" /> เพิ่ม
        </span>
      </div>
    </button>
  );
}
