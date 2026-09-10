import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ClipboardList, Coffee, ShieldCheck } from "lucide-react";

import { customerApi, type CustomerMenuItem } from "@/services/customerApi";
import { STORE_DISPLAY_NAME } from "@/config/brand";

const ALL_CATEGORY = "__all__";

function formatBaht(value: number): string {
  return `฿${value.toLocaleString("th-TH")}`;
}

/** Warm, branded placeholder used when a product has no image. */
function MenuPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary via-secondary to-accent/25">
      <div className="flex flex-col items-center gap-2 text-primary/70">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-background/60 shadow-inner">
          <Coffee className="h-8 w-8" aria-hidden />
        </span>
        <span className="text-xs font-semibold tracking-wide text-primary/60">{STORE_DISPLAY_NAME}</span>
      </div>
    </div>
  );
}

export default function CustomerMenuPage() {
  const [menus, setMenus] = useState<CustomerMenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY);

  function loadMenu() {
    setLoading(true);
    setError(null);
    customerApi
      .listMenu()
      .then((m) => setMenus(m))
      .catch((e: any) => setError(e?.message || "ไม่สามารถโหลดเมนูได้"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadMenu();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    menus.forEach((m) => {
      if (m.category) set.add(m.category);
    });
    return Array.from(set);
  }, [menus]);

  const visibleMenus = useMemo(() => {
    if (activeCategory === ALL_CATEGORY) return menus;
    return menus.filter((m) => m.category === activeCategory);
  }, [menus, activeCategory]);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 sm:py-8">
      {/* Hero header row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">เลือกเมนูโปรดของคุณ</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            แตะเมนูเพื่อปรับความหวาน เพิ่มช็อต และจำนวน แล้วเพิ่มลงตะกร้าได้เลย
          </p>
        </div>
        <Link
          to="/order/status"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
        >
          <ClipboardList className="h-4 w-4" aria-hidden />
          เช็กสถานะออเดอร์
        </Link>
      </div>

      {/* Category filter — scrolls cleanly on mobile, wraps on desktop */}
      {categories.length > 0 ? (
        <div className="no-scrollbar mt-5 flex flex-nowrap gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
          <button
            type="button"
            onClick={() => setActiveCategory(ALL_CATEGORY)}
            className={`bw-chip shrink-0 ${activeCategory === ALL_CATEGORY ? "bw-chip-active" : "bw-chip-idle"}`}
          >
            ทั้งหมด
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`bw-chip shrink-0 ${activeCategory === cat ? "bw-chip-active" : "bw-chip-idle"}`}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}

      {/* Product grid */}
      <div className="mt-6">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="bw-card animate-pulse overflow-hidden p-0">
                <div className="aspect-[4/3] w-full bg-muted" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="mt-2 h-7 w-full rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bw-card mx-auto max-w-md border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            <p>{error}</p>
            <button type="button" className="bw-cta mt-3" onClick={loadMenu}>
              ลองใหม่อีกครั้ง
            </button>
          </div>
        ) : visibleMenus.length === 0 ? (
          <div className="bw-card mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary">
              <Coffee className="h-7 w-7" aria-hidden />
            </span>
            <p className="text-base font-semibold">ยังไม่มีเมนูที่พร้อมขายในหมวดนี้</p>
            <p className="text-sm text-muted-foreground">โปรดลองเลือกหมวดอื่น หรือกลับมาใหม่ภายหลัง</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                    <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-primary shadow-sm backdrop-blur">
                      {m.category}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="space-y-1">
                    <p className="line-clamp-1 text-base font-bold leading-snug">{m.name}</p>
                    {m.description ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{m.description}</p>
                    ) : null}
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                    <div className="leading-none">
                      <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        ราคา
                      </span>
                      <span className="text-xl font-extrabold text-primary">{formatBaht(m.price)}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-transform group-hover:translate-x-0.5">
                      เลือก
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* PDPA / privacy note (compliance — kept, condensed) */}
      <div className="bw-card mt-8 flex gap-3 p-4 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">การใช้ข้อมูลส่วนตัว</p>
          <p className="text-xs leading-relaxed">
            ร้านจะใช้ข้อมูลเฉพาะที่จำเป็น เช่น ชื่อ เบอร์โทร รายการสั่งซื้อ เวลารับสินค้า และหลักฐานการชำระเงิน
            เพื่อรับออเดอร์ ตรวจสอบการชำระเงิน แจ้งสถานะ และให้บริการหลังการขายเท่านั้น
          </p>
          <Link to="/privacy" className="inline-block text-xs font-semibold text-primary underline">
            อ่านนโยบายความเป็นส่วนตัว
          </Link>
        </div>
      </div>
    </div>
  );
}
