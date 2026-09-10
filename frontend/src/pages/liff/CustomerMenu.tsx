import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ClipboardList, Coffee, Search, ShoppingBag } from "lucide-react";

import { customerApi, type CustomerMenuItem } from "@/services/customerApi";
import { readCart, getCartItemLineTotal } from "@/services/cartStorage";
import { STORE_DISPLAY_NAME } from "@/config/brand";

const ALL_CATEGORY = "__all__";

function formatBaht(value: number): string {
  return `฿${value.toLocaleString("th-TH")}`;
}

function readCartSummary(): { count: number; total: number } {
  const items = readCart();
  const count = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
  const total = items.reduce((sum, item) => sum + getCartItemLineTotal(item), 0);
  return { count, total };
}

/** Warm, branded placeholder used when a product has no image. Compact by design. */
function MenuPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary via-secondary to-accent/25">
      <div className="flex flex-col items-center gap-1 text-primary/70">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background/60 shadow-inner">
          <Coffee className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-[10px] font-semibold tracking-wide text-primary/60">{STORE_DISPLAY_NAME}</span>
      </div>
    </div>
  );
}

export default function CustomerMenuPage() {
  const [menus, setMenus] = useState<CustomerMenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY);
  const [query, setQuery] = useState("");
  const [cartSummary, setCartSummary] = useState<{ count: number; total: number }>(() => readCartSummary());

  function loadMenu() {
    setLoading(true);
    setError(null);
    customerApi
      .listMenu()
      .then((m) => setMenus(m))
      .catch(() => setError("ไม่สามารถโหลดเมนูได้ กรุณาลองใหม่อีกครั้ง"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadMenu();
  }, []);

  // Keep the sticky cart CTA in sync with cart changes made elsewhere.
  useEffect(() => {
    function refresh() {
      setCartSummary(readCartSummary());
    }
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    menus.forEach((m) => {
      if (m.category) set.add(m.category);
    });
    return Array.from(set);
  }, [menus]);

  const trimmedQuery = query.trim().toLowerCase();

  const visibleMenus = useMemo(() => {
    return menus.filter((m) => {
      if (activeCategory !== ALL_CATEGORY && m.category !== activeCategory) {
        return false;
      }
      if (trimmedQuery) {
        const haystack = `${m.name} ${m.description ?? ""}`.toLowerCase();
        if (!haystack.includes(trimmedQuery)) {
          return false;
        }
      }
      return true;
    });
  }, [menus, activeCategory, trimmedQuery]);

  // Distinguish "the store has no products at all" from "filters matched nothing".
  const menuIsEmpty = !loading && !error && menus.length === 0;
  const noFilterResult = !loading && !error && menus.length > 0 && visibleMenus.length === 0;
  const hasCartItems = cartSummary.count > 0;

  return (
    <div className={`mx-auto w-full max-w-[1120px] px-4 py-5 sm:px-6 sm:py-6 ${hasCartItems ? "pb-28" : ""}`}>
      {/* Compact page header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">เลือกเมนู</h1>
          <p className="truncate text-xs text-muted-foreground sm:text-sm">แตะเมนูเพื่อปรับตัวเลือกและเพิ่มลงตะกร้า</p>
        </div>
        <Link
          to="/order/status"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
        >
          <ClipboardList className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">เช็กสถานะออเดอร์</span>
          <span className="sm:hidden">สถานะ</span>
        </Link>
      </div>

      {/* Search */}
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          aria-label="ค้นหาเมนู"
          placeholder="ค้นหาเมนู"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bw-input min-h-[44px] w-full pl-9"
        />
      </div>

      {/* Category filter — horizontally scrollable chips on mobile, wraps on desktop */}
      {categories.length > 0 ? (
        <div className="no-scrollbar mt-3 flex flex-nowrap gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
          <button
            type="button"
            onClick={() => setActiveCategory(ALL_CATEGORY)}
            aria-pressed={activeCategory === ALL_CATEGORY}
            className={`bw-chip shrink-0 ${activeCategory === ALL_CATEGORY ? "bw-chip-active" : "bw-chip-idle"}`}
          >
            ทั้งหมด
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              aria-pressed={activeCategory === cat}
              className={`bw-chip shrink-0 ${activeCategory === cat ? "bw-chip-active" : "bw-chip-idle"}`}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}

      {/* Product grid */}
      <div className="mt-5">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bw-card animate-pulse overflow-hidden p-0">
                <div className="aspect-[4/3] w-full bg-muted" />
                <div className="space-y-2 p-3">
                  <div className="h-3.5 w-3/4 rounded bg-muted" />
                  <div className="h-5 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bw-card mx-auto max-w-md border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive" role="alert">
            <p>{error}</p>
            <button type="button" className="bw-cta mt-3" onClick={loadMenu}>
              ลองใหม่
            </button>
          </div>
        ) : menuIsEmpty ? (
          <div className="bw-card mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary">
              <Coffee className="h-7 w-7" aria-hidden />
            </span>
            <p className="text-base font-semibold">ยังไม่มีเมนูที่พร้อมขาย</p>
            <p className="text-sm text-muted-foreground">โปรดกลับมาใหม่ภายหลัง</p>
          </div>
        ) : noFilterResult ? (
          <div className="bw-card mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary">
              <Search className="h-7 w-7" aria-hidden />
            </span>
            <p className="text-base font-semibold">ไม่พบเมนูที่ตรงกับการค้นหา</p>
            <p className="text-sm text-muted-foreground">ลองปรับคำค้นหาหรือเลือกหมวดอื่น</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {visibleMenus.map((m) => (
              <Link
                key={m.id}
                to={`/order/${m.id}`}
                className="bw-card group flex flex-col overflow-hidden p-0 transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  {m.image_url ? (
                    <img
                      src={m.image_url}
                      alt={m.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <MenuPlaceholder />
                  )}
                  {m.category ? (
                    <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold text-primary shadow-sm backdrop-blur">
                      {m.category}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="line-clamp-2 text-sm font-bold leading-snug">{m.name}</p>
                  <div className="mt-auto flex items-end justify-between gap-1.5 pt-1">
                    <span className="text-base font-extrabold text-primary sm:text-lg">{formatBaht(m.price)}</span>
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-transform group-hover:translate-x-0.5">
                      เลือก
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Compact privacy access point (full consent lives on the confirm step) */}
      {!loading ? (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/privacy" className="font-semibold text-primary underline">
            นโยบายความเป็นส่วนตัว
          </Link>
        </p>
      ) : null}

      {/* Sticky cart CTA — only when the cart contains items */}
      {hasCartItems ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
          <div className="mx-auto max-w-[1120px] px-4 py-3 sm:px-6">
            <Link
              to="/order/cart"
              aria-label={`ดูตะกร้า ${cartSummary.count} รายการ รวม ${formatBaht(cartSummary.total)}`}
              className="bw-cta flex w-full items-center justify-center gap-2"
            >
              <ShoppingBag className="h-4 w-4" aria-hidden />
              <span className="tabular-nums">
                {cartSummary.count} รายการ • {formatBaht(cartSummary.total)}
              </span>
              <span>• ดูตะกร้า</span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
