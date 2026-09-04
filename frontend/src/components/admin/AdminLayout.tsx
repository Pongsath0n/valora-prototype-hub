import { NavLink, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import LogoBrand from "@/components/LogoBrand";
import { useAuth } from "@/contexts/AuthContext";
import { useProfileRole } from "@/contexts/RoleContext";
import {
  ADMIN_MOBILE_NAV,
  ADMIN_NAV_SECTIONS,
  OWNER_MOBILE_NAV,
  OWNER_NAV_SECTIONS,
  OWNER_UTILITY_NAV,
  STAFF_NAV_SECTIONS,
  isAdminRole,
  isManagerRole,
  resolveNavSections,
  type NavItem,
  type NavSection,
} from "@/config/navigation";

/* ── Nav item renderer ────────────────────────────────────────────────── */

function SidebarNavItem({
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

/* ── Layout ───────────────────────────────────────────────────────────── */

interface AdminLayoutProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** @deprecated Placeholder nav hiding is no longer needed — the shared
   *  navigation config does not include placeholder routes. Retained for
   *  backwards compatibility with existing callers. */
  forceHidePlaceholderNav?: boolean;
}

export default function AdminLayout({
  title,
  subtitle,
  children,
}: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { role } = useProfileRole();

  const isOwner = isManagerRole(role);
  const isAdmin = isAdminRole(role);

  // Resolve nav sections based on role.
  // Admin sees admin nav (System Console link + Business View).
  // Owner/manager see owner nav. Staff see staff nav.
  const navSections: NavSection[] = isAdmin
    ? resolveNavSections(ADMIN_NAV_SECTIONS, role)
    : isOwner
      ? resolveNavSections(OWNER_NAV_SECTIONS, role)
      : resolveNavSections(STAFF_NAV_SECTIONS, role);

  const utilityNav: NavItem[] = isOwner && !isAdmin ? OWNER_UTILITY_NAV : [];
  const mobileNav: NavItem[] = isAdmin
    ? ADMIN_MOBILE_NAV
    : isOwner
      ? OWNER_MOBILE_NAV
      : [];

  // Role-aware defaults.
  const effectiveTitle = title ?? (isAdmin || isOwner ? "Valora" : "Staff");
  const effectiveSubtitle = subtitle ?? (isAdmin || isOwner ? "" : "");

  // Staff back link — sends staff back to their primary workspace (POS).
  const staffBackLinkPath = "/staff/kiosk";
  const staffBackLinkLabel = "กลับไป POS";

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  const sidebarLabel = isAdmin ? "System Operator" : isOwner ? "Business Intelligence" : "Staff";
  const mobileHeaderLabel = isAdmin ? "Valora Admin" : isOwner ? "Valora" : "Valora Staff";

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* ── Desktop Sidebar ─────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 bg-sidebar text-sidebar-foreground border-r border-sidebar-border fixed inset-y-0 left-0 z-40">
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-sidebar-border">
          <LogoBrand size="sm" iconOnly dark />
          <div>
            <p className="font-bold text-sidebar-accent-foreground leading-none">Valora</p>
            <p className="text-[10px] text-sidebar-foreground/60 mt-0.5">{sidebarLabel}</p>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-0.5">
              <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
                {section.title}
              </p>
              {section.items.map((item) => (
                <SidebarNavItem key={item.path} {...item} />
              ))}
            </div>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border space-y-0.5">
          <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
            บัญชี
          </p>
          {utilityNav.map((item) => (
            <SidebarNavItem key={item.path} {...item} />
          ))}
          {!isOwner ? (
            <NavLink
              to={staffBackLinkPath}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 flex-shrink-0" />
              <span>{staffBackLinkLabel}</span>
            </NavLink>
          ) : null}
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

      {/* ── Mobile Header ───────────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b h-14 flex items-center justify-between px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <LogoBrand size="sm" iconOnly />
          <span className="font-semibold text-sm">{mobileHeaderLabel}</span>
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

      {/* ── Mobile Sidebar Drawer ───────────────────────────────────── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-14 bottom-0 w-64 bg-sidebar text-sidebar-foreground px-3 py-4 space-y-4 overflow-y-auto shadow-xl pb-24">
            {navSections.map((section) => (
              <div key={`mobile-${section.title}`} className="space-y-0.5">
                <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
                  {section.title}
                </p>
                {section.items.map((item) => (
                  <SidebarNavItem
                    key={`mobile-${section.title}-${item.path}`}
                    {...item}
                    onClick={() => setSidebarOpen(false)}
                  />
                ))}
              </div>
            ))}
            <div className="pt-3 mt-3 border-t border-sidebar-border space-y-0.5">
              <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">
                บัญชี
              </p>
              {utilityNav.map((item) => (
                <SidebarNavItem
                  key={`mobile-utility-${item.path}`}
                  {...item}
                  onClick={() => setSidebarOpen(false)}
                />
              ))}
              {!isOwner ? (
                <NavLink
                  to={staffBackLinkPath}
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {staffBackLinkLabel}
                </NavLink>
              ) : null}
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

      {/* ── Mobile Bottom Nav (Owner only) ──────────────────────────── */}
      {isOwner && mobileNav.length > 0 ? (
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
      ) : null}

      {/* ── Main Content ────────────────────────────────────────────── */}
      <main className="flex-1 md:ml-60 pt-14 md:pt-0 min-h-screen overflow-x-hidden">
        <div
          className={`max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-6 animate-fade-in space-y-6 ${
            isOwner && mobileNav.length > 0 ? "pb-20 md:pb-6" : "pb-10 md:pb-0"
          }`}
        >
          <header>
            <h1 className="page-title">{effectiveTitle}</h1>
            {effectiveSubtitle ? <p className="page-subtitle">{effectiveSubtitle}</p> : null}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
