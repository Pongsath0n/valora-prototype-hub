import { NavLink, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorSmartphone,
  Settings,
  Soup,
  X,
} from "lucide-react";
import { useState } from "react";
import LogoBrand from "@/components/LogoBrand";
import { useAuth } from "@/contexts/AuthContext";
import { useProfileRole } from "@/contexts/RoleContext";
import type { AppRole } from "@/lib/guards";

const MANAGER_NAV_ROLES: AppRole[] = ["owner", "admin", "manager"];

type StoreNavItem = {
  title: string;
  path: string;
  icon: React.ElementType;
  end?: boolean;
  roles?: AppRole[];
};

const storeNavSections: { title: string; items: StoreNavItem[] }[] = [
  {
    title: "งานประจำวัน",
    items: [
      // Healholic V1 staff scope: POS (Kiosk) + Orders/Sales only.
      { title: "POS (Kiosk)", path: "/staff/kiosk", icon: MonitorSmartphone, end: true },
      { title: "ออเดอร์", path: "/staff/orders", icon: ClipboardList },
    ],
  },
  {
    title: "การจัดการร้าน",
    items: [
      { title: "เมนู", path: "/owner/menus", icon: Soup, roles: MANAGER_NAV_ROLES },
      { title: "วัตถุดิบ / สต็อก", path: "/owner/cost-items", icon: Settings, roles: MANAGER_NAV_ROLES },
      { title: "สูตรและต้นทุน", path: "/owner/recipes", icon: Settings, roles: MANAGER_NAV_ROLES },
      // Reports link points to the canonical owner reports route (/owner/reports).
      { title: "รายงาน", path: "/owner/reports", icon: LayoutDashboard, roles: MANAGER_NAV_ROLES },
      { title: "ตั้งค่าการชำระเงิน", path: "/owner/payment-settings", icon: CreditCard, roles: MANAGER_NAV_ROLES },
    ],
  },
];

const PLACEHOLDER_PATHS = new Set(["/store-admin/pos", "/store-admin/reports", "/staff/pos", "/staff/reports"]);
const shouldHidePlaceholderNav = () => !import.meta.env.DEV;

function StoreNavItem({
  path,
  icon: Icon,
  title,
  end,
  onClick,
}: {
  path: string;
  icon: React.ElementType;
  title: string;
  end?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={path}
      end={end}
      onClick={onClick}
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

interface AdminLayoutProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  forceHidePlaceholderNav?: boolean;
}

export default function AdminLayout({
  title = "Valora Store Admin",
  subtitle = "จัดการออเดอร์ การชำระเงิน เมนู และการตั้งค่าร้าน",
  children,
  forceHidePlaceholderNav,
}: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { role } = useProfileRole();

  const hidePlaceholders = forceHidePlaceholderNav ?? shouldHidePlaceholderNav();

  const visibleSections = storeNavSections
    .map((section) => ({
      title: section.title,
      items: section.items.filter((item) => {
        if (hidePlaceholders && PLACEHOLDER_PATHS.has(item.path)) {
          return false;
        }
        if (!item.roles) return true;
        return role ? item.roles.includes(role) : false;
      }),
    }))
    .filter((section) => section.items.length > 0);

  const canAccessBusinessPortal = role ? MANAGER_NAV_ROLES.includes(role) : false;
  const backLinkPath = canAccessBusinessPortal ? "/owner/dashboard" : "/staff";
  const backLinkLabel = canAccessBusinessPortal ? "กลับไปหน้าร้าน" : "กลับไปแดชบอร์ดร้าน";

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-sidebar text-sidebar-foreground border-r border-sidebar-border fixed inset-y-0 left-0 z-40">
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-sidebar-border">
          <LogoBrand size="sm" iconOnly dark />
          <div>
            <p className="font-bold text-sidebar-accent-foreground leading-none">Valora</p>
            <p className="text-[10px] text-sidebar-foreground/60 mt-0.5">Store Admin</p>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
          {visibleSections.map((section) => (
            <div key={section.title} className="space-y-0.5">
              <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
                {section.title}
              </p>
              {section.items.map((item) => (
                <StoreNavItem key={item.path} {...item} />
              ))}
            </div>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border space-y-0.5">
          <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
            บัญชี
          </p>
          <NavLink
            to={backLinkPath}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 flex-shrink-0" />
            <span>{backLinkLabel}</span>
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors cursor-pointer text-left"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b h-14 flex items-center justify-between px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <LogoBrand size="sm" iconOnly />
          <span className="font-semibold text-sm">Store Admin</span>
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 text-foreground rounded-lg hover:bg-muted transition-colors"
          aria-label="Toggle navigation"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-14 bottom-0 w-64 bg-sidebar text-sidebar-foreground px-3 py-4 space-y-0.5 overflow-y-auto shadow-xl">
            <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
              เมนูร้าน
            </p>
            {visibleSections.map((section) => (
              <div key={section.title} className="space-y-0.5">
                <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
                  {section.title}
                </p>
                {section.items.map((item) => (
                  <StoreNavItem key={item.path} {...item} onClick={() => setSidebarOpen(false)} />
                ))}
              </div>
            ))}
            <div className="pt-3 mt-3 border-t border-sidebar-border space-y-0.5">
              <NavLink
                to={backLinkPath}
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                {backLinkLabel}
              </NavLink>
              <button
                type="button"
                onClick={() => {
                  setSidebarOpen(false);
                  void handleLogout();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors text-left"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:ml-60 pt-14 md:pt-0 pb-10 md:pb-0 min-h-screen overflow-x-hidden">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-6 animate-fade-in space-y-6">
          <header>
            <h1 className="page-title">{title}</h1>
            {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
