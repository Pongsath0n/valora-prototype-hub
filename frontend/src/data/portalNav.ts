import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  ClipboardList,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  Users,
} from "lucide-react";
import type { AppRole } from "@/lib/guards";

export type PortalNavItem = {
  title: string;
  path: string;
  icon: LucideIcon;
  roles: AppRole[] | "all";
  description?: string;
};

const ALL_ROLES: AppRole[] = ["owner", "admin", "manager", "staff"];

export const BUSINESS_PORTAL_NAV: PortalNavItem[] = [
  {
    title: "แดชบอร์ดธุรกิจ",
    path: "/app/dashboard",
    icon: LayoutDashboard,
    roles: ["owner", "admin", "manager"],
  },
  {
    title: "วางแผนกำไร",
    path: "/app/planning",
    icon: TrendingUp,
    roles: ["owner", "admin", "manager"],
    description: "เครื่องมือหลักของ Valora — จำลองสถานการณ์กำไรและจุดคุ้มทุน",
  },
  {
    title: "รายงาน",
    path: "/app/reports",
    icon: BarChart3,
    roles: ["owner", "admin", "manager"],
  },
  {
    title: "Store Admin",
    path: "/store-admin",
    icon: ClipboardList,
    roles: ALL_ROLES,
  },
];

export const SYSTEM_PORTAL_NAV: PortalNavItem[] = [
  {
    title: "System Console",
    path: "/system",
    icon: Stethoscope,
    roles: ["owner"],
  },
  {
    title: "User Management",
    path: "/system/users",
    icon: Users,
    roles: ["owner"],
  },
  {
    title: "Role Management",
    path: "/system/roles",
    icon: ShieldCheck,
    roles: ["owner"],
  },
  {
    title: "Health Check",
    path: "/system/health",
    icon: Activity,
    roles: ["owner"],
  },
  {
    title: "Audit Logs",
    path: "/system/audit-logs",
    icon: FileText,
    roles: ["owner"],
  },
  // "Storage Check" duplicate removed — canonical access is the Health Check page
  // (/system/health#storage). The legacy /system/storage redirect is preserved in App.tsx.
];
