import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Soup,
  Package,
  BookOpenCheck,
  Store,
  Calculator,
  ShoppingCart,
  ClipboardList,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import LogoBrand from "@/components/LogoBrand";

const mainNav = [
  { title: "แดชบอร์ด", path: "/app/dashboard", icon: LayoutDashboard },
  { title: "เมนู", path: "/app/menu", icon: Soup },
  { title: "วัตถุดิบ", path: "/app/ingredients", icon: Package },
  { title: "สูตรและต้นทุน", path: "/app/recipes", icon: BookOpenCheck },
  { title: "ช่องทางขาย", path: "/app/channels", icon: Store },
  { title: "ราคาตามช่องทาง", path: "/app/channel-pricing", icon: Calculator },
  { title: "POS", path: "/app/pos", icon: ShoppingCart },
  { title: "ออเดอร์", path: "/app/orders", icon: ClipboardList },
  { title: "รายงาน", path: "/app/reports", icon: BarChart3 },
  { title: "วิเคราะห์สถานการณ์", path: "/dashboard/insights", icon: BarChart3 },
];

const utilityNav = [
  { title: "ตั้งค่า", path: "/app/settings", icon: Settings },
];

const mobileNav = [
  { title: "หน้าหลัก", path: "/app/dashboard", icon: LayoutDashboard },
  { title: "เมนู", path: "/app/menu", icon: Soup },
  { title: "POS", path: "/app/pos", icon: ShoppingCart },
  { title: "ออเดอร์", path: "/app/orders", icon: ClipboardList },
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
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
            เมนูหลัก
          </p>
          {mainNav.map((item) => (
            <NavItem key={item.path} {...item} />
          ))}
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
          <aside className="absolute left-0 top-14 bottom-0 w-64 bg-sidebar text-sidebar-foreground px-3 py-4 space-y-0.5 overflow-y-auto shadow-xl">
            <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
              เมนูหลัก
            </p>
            {mainNav.map((item) => (
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
