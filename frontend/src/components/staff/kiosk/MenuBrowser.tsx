import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CustomerMenuItem } from "@/services/customerApi";
import { ALL_CATEGORY } from "@/features/staff/kiosk";

import ProductCard from "./ProductCard";

type MenuBrowserProps = {
  search: string;
  onSearchChange: (value: string) => void;
  categories: string[];
  activeCategory: string;
  onCategoryChange: (value: string) => void;
  menuLoading: boolean;
  menuError: string | null;
  onReload: () => void;
  visibleMenus: CustomerMenuItem[];
  onSelectProduct: (product: CustomerMenuItem) => void;
};

/**
 * Step 1 — left column. Owns menu search, category tabs and the product grid,
 * plus the loading / error / empty presentations. Stateless: all data comes in
 * via props from the kiosk hook.
 */
export default function MenuBrowser({
  search,
  onSearchChange,
  categories,
  activeCategory,
  onCategoryChange,
  menuLoading,
  menuError,
  onReload,
  visibleMenus,
  onSelectProduct,
}: MenuBrowserProps) {
  return (
    <section className="flex flex-col gap-4">
      <header className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">เลือกเมนูและปรับรายละเอียด</h2>
        <p className="text-sm text-muted-foreground">
          ค้นหาเมนู เลือกความหวาน ท็อปปิง และจำนวน แล้วเพิ่มลงตะกร้าทางขวา
        </p>
      </header>

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="ค้นหาเมนู"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeCategory === ALL_CATEGORY ? "default" : "outline"}
            onClick={() => onCategoryChange(ALL_CATEGORY)}
            size="sm"
          >
            ทั้งหมด
          </Button>
          {categories.map((item) => (
            <Button
              key={item}
              variant={activeCategory === item ? "default" : "outline"}
              onClick={() => onCategoryChange(item)}
              size="sm"
            >
              {item}
            </Button>
          ))}
        </div>
      </div>

      {menuLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="space-y-2 rounded-xl border bg-muted/20 p-3">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
              <div className="h-3 w-1/3 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : menuError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          <p>{menuError}</p>
          <Button variant="outline" className="mt-4" onClick={onReload}>
            ลองใหม่อีกครั้ง
          </Button>
        </div>
      ) : visibleMenus.length === 0 ? (
        <div className="rounded-2xl border bg-muted/20 p-10 text-center text-muted-foreground">
          ยังไม่มีเมนูในหมวดนี้
        </div>
      ) : (
        <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4")}>
          {visibleMenus.map((item) => (
            <ProductCard key={item.id} product={item} onSelect={onSelectProduct} />
          ))}
        </div>
      )}
    </section>
  );
}
