import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Coffee, ShoppingBag } from "lucide-react";

import { readCart, getCartItemLineTotal } from "@/services/cartStorage";
import { STORE_DISPLAY_NAME } from "@/config/brand";

function formatBaht(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function readCartSummary(): { count: number; total: number } {
  const items = readCart();
  const count = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
  const total = items.reduce((sum, item) => sum + getCartItemLineTotal(item), 0);
  return { count, total };
}

/** Menu landing routes use a wider header to match the kiosk-style grid. */
const WIDE_HEADER_ROUTES = new Set(["/order"]);

type LineLinkTokenContextValue = {
  lineLinkToken: string | null;
  clearLineLinkToken: () => void;
};

const LineLinkTokenContext = createContext<LineLinkTokenContextValue | undefined>(undefined);

export function useLineLinkToken(): LineLinkTokenContextValue {
  return useContext(LineLinkTokenContext) ?? { lineLinkToken: null, clearLineLinkToken: () => undefined };
}

type CustomerThemeLayoutProps = {
  children: React.ReactNode;
  /** Show the cart summary pill in the header. Defaults to true. */
  showCart?: boolean;
  /** Short ordering message shown under the brand name. */
  tagline?: string;
};

/**
 * Theme + chrome wrapper for the public customer ordering flow.
 *
 * It only scopes the warm cafe palette (via `.brewway-customer`) and renders a
 * shared brand header + live cart summary. No business logic lives here — cart
 * totals are read straight from cartStorage, and no cost/profit data is touched.
 */
export default function CustomerThemeLayout({
  children,
  showCart = true,
  tagline = "สั่งกาแฟสดง่าย ๆ ไม่ต้องล็อกอิน",
}: CustomerThemeLayoutProps) {
  const { pathname, search } = useLocation();
  const headerWidthClass = WIDE_HEADER_ROUTES.has(pathname) ? "max-w-[1120px]" : "max-w-md";
  const [summary, setSummary] = useState<{ count: number; total: number }>(() => readCartSummary());
  const [lineLinkToken, setLineLinkToken] = useState<string | null>(() => {
    const params = new URLSearchParams(search);
    const initial = params.get("line_link_token");
    return initial?.trim() || null;
  });

  useEffect(() => {
    function refresh() {
      setSummary(readCartSummary());
    }
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const tokenParam = params.get("line_link_token");
    if (tokenParam) {
      setLineLinkToken(tokenParam.trim());
    }
  }, [search]);

  const tokenContextValue = useMemo<LineLinkTokenContextValue>(
    () => ({
      lineLinkToken,
      clearLineLinkToken: () => setLineLinkToken(null),
    }),
    [lineLinkToken],
  );

  return (
    <LineLinkTokenContext.Provider value={tokenContextValue}>
      <div className="brewway-customer bw-surface text-foreground">
        <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className={`mx-auto flex ${headerWidthClass} items-center justify-between gap-3 px-4 py-3 sm:px-6`}>
          <Link to="/order" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Coffee className="h-5 w-5" aria-hidden />
            </span>
            <span className="leading-tight">
              <span className="block text-base font-bold tracking-tight">{STORE_DISPLAY_NAME}</span>
              <span className="block text-xs text-muted-foreground">{tagline}</span>
            </span>
          </Link>

          {showCart ? (
            <Link
              to="/order/cart"
              aria-label="ดูตะกร้า"
              className="relative inline-flex min-h-[44px] items-center gap-2 rounded-full border border-primary/30 bg-card px-3 py-1.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-secondary"
            >
              <span className="relative inline-flex">
                <ShoppingBag className="h-5 w-5" aria-hidden />
                {summary.count > 0 ? (
                  <span className="absolute -right-2 -top-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                    {summary.count}
                  </span>
                ) : null}
              </span>
              <span className="tabular-nums">{formatBaht(summary.total)}</span>
            </Link>
          ) : null}
        </div>
      </header>

      <main className="pb-12">{children}</main>
      </div>
    </LineLinkTokenContext.Provider>
  );
}
