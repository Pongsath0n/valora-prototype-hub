import { NavLink, useNavigate } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import LogoBrand from "@/components/LogoBrand";
// PortalSwitcher pill links removed from the Owner sidebar — they duplicated the
// main grouped navigation. PortalSwitcher remains available for other surfaces.
import { useProfileRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  ADMIN_MOBILE_NAV,
  ADMIN_NAV_SECTIONS,
  OWNER_MOBILE_NAV,
  OWNER_NAV_SECTIONS,
  OWNER_UTILITY_NAV,
  isAdminRole,
  resolveNavSections,
  type NavItem,
  type NavSection,
} from "@/config/navigation";

function NavItem({ path, icon: Icon, title, end }: { path: string; icon: React.ElementType; title: string; end?: boolean }) {
  return (
    <NavLink
      to={path}
      end={end}
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
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { role, loading } = useProfileRole();
  const isAdmin = isAdminRole(role);
  const resolvedSections: NavSection[] = isAdmin
    ? resolveNavSections(ADMIN_NAV_SECTIONS, role)
    : resolveNavSections(OWNER_NAV_SECTIONS, role);
  const mobileNav = isAdmin ? ADMIN_MOBILE_NAV : OWNER_MOBILE_NAV;
  const utilityNav = isAdmin ? [] : OWNER_UTILITY_NAV;
  const sidebarLabel = isAdmin ? "System Operator" : "Business Intelligence";

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* ── Desktop Sidebar ──────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 bg-sidebar text-sidebar-foreground border-r border-sidebar-border fixed inset-y-0 left-0 z-40">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-sidebar-border">
          <LogoBrand size="sm" iconOnly dark />
          <div>
            <p className="font-bold text-sidebar-accent-foreground leading-none">Valora</p>
            <p className="text-[10px] text-sidebar-foreground/60 mt-0.5">{sidebarLabel}</p>
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
          {utilityNav.map((item: NavItem) => (
            <NavItem key={item.path} {...item} />
          ))}
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors cursor-pointer text-left"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Header ─────────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b h-14 flex items-center justify-between px-4 shadow-sm">
        <LogoBrand size="sm" iconOnly />
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 text-foreground rounded-lg hover:bg-muted transition-colors"
          aria-label="Toggle navigation"
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
          <aside className="absolute left-0 top-14 bottom-0 w-64 bg-sidebar text-sidebar-foreground px-3 py-4 space-y-4 overflow-y-auto shadow-xl pb-24">
            {resolvedSections.map((section) => (
              <div key={`mobile-${section.title}`} className="space-y-1">
                <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3">
                  {section.title}
                </p>
                {section.items.map((item) => (
                  <NavLink
                    key={`mobile-${section.title}-${item.path}`}
                    to={item.path}
                    end={item.end}
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
              <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
                บัญชี
              </p>
              {utilityNav.map((item) => (
                <NavLink
                  key={`mobile-utility-${item.path}`}
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

      {/* Mobile Bottom Nav — hidden when drawer is open to prevent z-index overlap */}
      <nav className={`bottom-nav md:hidden ${sidebarOpen ? "hidden" : ""}`}>
        {mobileNav.map((item) => (
          <NavLink
            key={`bottom-${item.path}`}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `bottom-nav-item ${isActive ? "active" : ""}`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px]">{item.title}</span>
          </NavLink>
        ))}
      </nav>

      {/* ── Main Content ──────────────────────────────────────────── */}
      <main className="flex-1 md:ml-60 pt-14 md:pt-0 pb-20 md:pb-0 min-h-screen overflow-x-hidden">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 py-6 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
