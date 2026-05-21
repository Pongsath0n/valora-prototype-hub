import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Database,
  FileText,
  LogOut,
  Menu,
  ShieldCheck,
  Terminal,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import LogoBrand from "@/components/LogoBrand";
import { useAuth } from "@/contexts/AuthContext";

const systemNav = [
  { title: "ภาพรวมระบบ", path: "/system", icon: Terminal, end: true },
  { title: "จัดการผู้ใช้", path: "/system/users", icon: Users },
  { title: "จัดการสิทธิ์", path: "/system/roles", icon: ShieldCheck },
  { title: "ตรวจสอบระบบ", path: "/system/health", icon: Activity },
  { title: "บันทึกเหตุการณ์", path: "/system/audit-logs", icon: FileText },
  { title: "Storage Check", path: "/system/health#storage", icon: Database },
];

function SystemNavItem({
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

interface SystemLayoutProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function SystemLayout({
  title = "Valora Internal System Console",
  subtitle = "สำหรับดูแลระบบ ผู้ใช้ สิทธิ์ และสถานะระบบ",
  children,
}: SystemLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useAuth();

  async function handleLogout() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen flex w-full bg-background">
      <aside className="hidden md:flex flex-col w-60 bg-sidebar text-sidebar-foreground border-r border-sidebar-border fixed inset-y-0 left-0 z-40">
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-sidebar-border">
          <LogoBrand size="sm" iconOnly dark />
          <div>
            <p className="font-bold text-sidebar-accent-foreground leading-none">Valora</p>
            <p className="text-[10px] text-sidebar-foreground/60 mt-0.5">System Console</p>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
            Internal System Console
          </p>
          {systemNav.map((item) => (
            <SystemNavItem key={item.path} {...item} />
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border space-y-0.5">
          <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
            บัญชี
          </p>
          <NavLink
            to="/admin"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 flex-shrink-0" />
            <span>กลับไปหน้า Admin</span>
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

      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b h-14 flex items-center justify-between px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <LogoBrand size="sm" iconOnly />
          <span className="font-semibold text-sm">System Console</span>
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

      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-14 bottom-0 w-64 bg-sidebar text-sidebar-foreground px-3 py-4 space-y-0.5 overflow-y-auto shadow-xl">
            <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
              Internal System Console
            </p>
            {systemNav.map((item) => (
              <SystemNavItem key={item.path} {...item} onClick={() => setSidebarOpen(false)} />
            ))}
            <div className="pt-3 mt-3 border-t border-sidebar-border space-y-0.5">
              <NavLink
                to="/admin"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                กลับไปหน้า Admin
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
