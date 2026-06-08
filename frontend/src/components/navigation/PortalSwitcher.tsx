import { NavLink } from "react-router-dom";
import { BUSINESS_PORTAL_NAV, SYSTEM_PORTAL_NAV, type PortalNavItem } from "@/data/portalNav";
import { useProfileRole } from "@/contexts/RoleContext";
import type { AppRole } from "@/lib/guards";

function filterByRole(items: PortalNavItem[], role: AppRole) {
  if (!role) return [];
  return items.filter((item) => item.roles === "all" || item.roles.includes(role));
}

export function PortalSwitcher({ variant = "inline" }: { variant?: "inline" | "stack" }) {
  const { role, loading } = useProfileRole();

  if (loading) {
    return <div className="text-xs text-muted-foreground">กำลังตรวจสอบสิทธิ์...</div>;
  }

  if (!role) {
    return null;
  }

  const businessLinks = filterByRole(BUSINESS_PORTAL_NAV, role);
  const systemLinks = filterByRole(SYSTEM_PORTAL_NAV, role);
  const combined = [...businessLinks, ...systemLinks];

  if (!combined.length) {
    return null;
  }

  if (variant === "stack") {
    return (
      <div className="space-y-2">
        {businessLinks.length ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Business</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {businessLinks.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                      isActive
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30"
                    }`
                  }
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.title}
                </NavLink>
              ))}
            </div>
          </div>
        ) : null}

        {systemLinks.length ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">System</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {systemLinks.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                      isActive
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30"
                    }`
                  }
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.title}
                </NavLink>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {combined.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40"
            }`
          }
        >
          <item.icon className="h-3.5 w-3.5" />
          {item.title}
        </NavLink>
      ))}
    </div>
  );
}
