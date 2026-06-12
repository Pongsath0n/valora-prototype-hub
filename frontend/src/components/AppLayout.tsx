import { NavLink } from "react-router-dom";
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Soup,
  Store,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import LogoBrand from "@/components/LogoBrand";
// PortalSwitcher pill links removed from the Owner sidebar — they duplicated the
// main grouped navigation. PortalSwitcher remains available for other surfaces.
import { useProfileRole } from "@/contexts/RoleContext";
import type { AppRole } from "@/lib/guards";

type OwnerNavItem = {
  title: string;
  path: string;
  icon: React.ElementType;
  roles?: AppRole[];
};

type OwnerNavSection = {
  title: string;
  items: OwnerNavItem[];
};

/**
 * Owner navigation — organized around business purpose.
 * Profit Planning (/app/planning) is the core product engine of Valora.
 *
 * Deliberately NOT in this nav:
 * - /app/pos, /store-admin/pos  → POS prototype is deferred (redirected in prod)
 * - /app/orders                 → duplicate of /store-admin/orders; redirected
 * - legacy /app/menu, /app/channels, /app/channel-pricing, /app/ingredients,
 *   /app/recipes                → canonical config lives under /store-admin/*
 * - /store-admin/reports        → canonical reports route is /app/reports
 */
const OWNER_NAV_SECTIONS: OwnerNavSection[] = [
  {
    title: "ภาพรวมธุรกิจ",
    items: [
      { title: "แดชบอร์ดธุรกิจ", path: "/app/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "การวางแผนกำไร",
    items: [
      { title: "วางแผนกำไร", path: "/app/planning", icon: TrendingUp },
    ],
  },
  {
    title: "ผลประกอบการ",
    items: [
      { title: "รายงานสรุป", path: "/app/reports", icon: BarChart3 },
    ],
  },
  {
    title: "เมนู ราคา และช่องทางขาย",
    items: [
      { title: "เมนูและหมวดหมู่", path: "/store-admin/menus", icon: Soup },
      { title: "ช่องทางขาย", path: "/store-admin/channels", icon: Store },
      { title: "ราคาตามช่องทาง", path: "/store-admin/channel-pricing", icon: Store },
    ],
  },
  {
    title: "ต้นทุนและสูตร",
    items: [
      { title: "วัตถุดิบ", path: "/store-admin/ingredients", icon: Soup },
      { title: "สูตรและต้นทุน", path: "/store-admin/recipes", icon: BookOpenCheck },
    ],
  },
  {
    title: "ภาพรวมลูกค้าและออเดอร์",
    items: [
      { title: "ลูกค้า", path: "/store-admin/customers", icon: Users },
      { title: "ออเดอร์ (ติดตามภาพรวม)", path: "/store-admin/orders", icon: ClipboardList },
    ],
  },
  {
    title: "ระบบ",
    items: [
      { title: "System Console", path: "/system", icon: Activity, roles: ["owner"] },
      { title: "จัดการผู้ใช้", path: "/system/users", icon: Users, roles: ["owner"] },
      { title: "จัดการสิทธิ์", path: "/system/roles", icon: ShieldCheck, roles: ["owner"] },
      { title: "System Health", path: "/system/health", icon: Activity, roles: ["owner"] },
      { title: "บันทึกเหตุการณ์", path: "/system/audit-logs", icon: FileText, roles: ["owner"] },
    ],
  },
];

const utilityNav = [
  { title: "ตั้งค่า", path: "/app/settings", icon: Settings },
];

const mobileNav = [
  { title: "ภาพรวม", path: "/app/dashboard", icon: LayoutDashboard },
  { title: "วางแผนกำไร", path: "/app/planning", icon: TrendingUp },
  { title: "รายงาน", path: "/app/reports", icon: BarChart3 },
  { title: "ออเดอร์", path: "/store-admin/orders", icon: ClipboardList },
  { title: "ตั้งค่า", path: "/app/settings", icon: Settings },
];

function NavItem({ path, icon: Icon, title }: { path: string; icon: React.ElementType; title: string }) {
  return (
    <NavLink
      to={path}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
            : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        }`
      }
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{title}</span>
    </NavLink>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { role, loading } = useProfileRole();
  const resolvedSections = OWNER_NAV_SECTIONS.map((section) => ({
    title: section.title,
    items: section.items.filter((item) => {
      if (!item.roles?.length) return true;
      if (!role) return false;
      return item.roles.includes(role as AppRole);
    }),
  })).filter((section) => section.items.length);

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* ── Desktop Sidebar ──────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 bg-sidebar text-sidebar-foreground border-r border-sidebar-border fixed inset-y-0 left-0 z-40">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-sidebar-border">
          <LogoBrand size="sm" iconOnly dark />
          <div>
            <p className="font-bold text-sidebar-accent-foreground leading-none">Valora</p>
            <p className="text-[10px] text-sidebar-foreground/60 mt-0.5">Business Intelligence</p>
          </div>
        </div>

        {/* Main nav */}
        <nav className="flex-1 py-4 px-3 space-y-5 overflow-y-auto">
          {!loading && role
            ? resolvedSections.map((section) => (
                <div key={section.title} className="space-y-1">
                  <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3">
                    {section.title}
                  </p>
                  {section.items.map((item) => (
                    <NavItem key={`${section.title}-${item.path}`} {...item} />
                  ))}
                </div>
              ))
            : null}
        </nav>

        {/* Utility nav */}
        <div className="px-3 py-4 border-t border-sidebar-border space-y-0.5">
          <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
            บัญชี
          </p>
          {utilityNav.map((item) => (
            <NavItem key={item.path} {...item} />
          ))}
          <NavLink
            to="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span>ออกจากระบบ</span>
          </NavLink>
        </div>
      </aside>

      {/* ── Mobile Header ─────────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b h-14 flex items-center justify-between px-4 shadow-sm">
        <LogoBrand size="sm" iconOnly />
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 text-foreground rounded-lg hover:bg-muted transition-colors"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-14 bottom-0 w-64 bg-sidebar text-sidebar-foreground px-3 py-4 space-y-4 overflow-y-auto shadow-xl">
            {resolvedSections.map((section) => (
              <div key={`mobile-${section.title}`} className="space-y-1">
                <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3">
                  {section.title}
                </p>
                {section.items.map((item) => (
                  <NavLink
                    key={`mobile-${section.title}-${item.path}`}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4" />
                    {item.title}
                  </NavLink>
                ))}
              </div>
            ))}
            <div className="pt-3 mt-3 border-t border-sidebar-border space-y-0.5">
              {utilityNav.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {item.title}
                </NavLink>
              ))}
            </div>
          </aside>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      <nav className="bottom-nav md:hidden">
        {mobileNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `bottom-nav-item ${isActive ? "active" : ""}`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px]">{item.title}</span>
          </NavLink>
        ))}
      </nav>

      {/* ── Main Content ──────────────────────────────────── */}
      <main className="flex-1 md:ml-56 pt-14 md:pt-0 pb-20 md:pb-0 min-h-screen overflow-x-hidden">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 py-6 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
