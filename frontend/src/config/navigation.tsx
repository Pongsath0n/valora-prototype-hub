import {
  Activity,
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  MonitorSmartphone,
  Package,
  ShieldCheck,
  Soup,
  Terminal,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppRole } from "@/lib/guards";

/**
 * Shared navigation configuration for Healholic V1.
 *
 * Both AppLayout (Owner portal) and AdminLayout (Store Admin / Staff) import
 * from this module so that owners see the same sidebar regardless of which
 * layout a page uses, and staff see a focused operational sidebar.
 *
 * V1 visible scope: Dashboard, POS, Products, Ingredients/Stock, Recipes,
 * Orders/Sales, Reports, Payment Settings.
 *
 * Deferred features (LINE, Online Ordering, Pickup, Delivery, Payment Slip
 * Review, Omise, Promotions, Loyalty, prototype onboarding, System Audit) are
 * intentionally absent from these arrays.
 */

export type NavItem = {
  title: string;
  path: string;
  icon: LucideIcon;
  end?: boolean;
  roles?: AppRole[];
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

/** Roles that may see management-level navigation. */
export const MANAGER_NAV_ROLES: AppRole[] = ["owner", "admin", "manager"];

/* ── Owner ────────────────────────────────────────────────────────────── */

/**
 * Owner navigation — Healholic V1 aligned.
 *
 * Groups:
 * 1. ภาพรวมธุรกิจ — Dashboard
 * 2. POS และออเดอร์ — POS (Kiosk) + Orders
 * 3. เมนูและสูตร — Products, Recipes
 * 4. วัตถุดิบและสต็อก — Ingredients / Inventory
 * 5. ผลประกอบการ — Reports
 * 6. การจัดการร้าน — Payment Settings, User Management, Role Management
 *
 * User/Role Management are placed under store-management (NOT the full System
 * Console). Owner already has SYSTEM_CONSOLE_ROLES permission; these links
 * provide direct access without surfacing the full internal console.
 */
export const OWNER_NAV_SECTIONS: NavSection[] = [
  {
    title: "ภาพรวมธุรกิจ",
    items: [
      { title: "แดชบอร์ดธุรกิจ", path: "/owner/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "POS และออเดอร์",
    items: [
      { title: "POS (Kiosk)", path: "/staff/kiosk", icon: MonitorSmartphone, end: true },
      { title: "ออเดอร์ (ติดตามภาพรวม)", path: "/staff/orders", icon: ClipboardList },
    ],
  },
  {
    title: "เมนูและสูตร",
    items: [
      { title: "เมนูและหมวดหมู่", path: "/owner/menus", icon: Soup },
      { title: "สูตรและต้นทุน", path: "/owner/recipes", icon: BookOpenCheck },
    ],
  },
  {
    title: "วัตถุดิบและสต็อก",
    items: [
      { title: "วัตถุดิบ / สต็อก", path: "/owner/cost-items", icon: Package },
    ],
  },
  {
    title: "ผลประกอบการ",
    items: [
      { title: "รายงานสรุป", path: "/owner/reports", icon: BarChart3 },
    ],
  },
  {
    title: "การจัดการร้าน",
    items: [
      { title: "ตั้งค่าการชำระเงิน", path: "/owner/payment-settings", icon: CreditCard },
      { title: "จัดการผู้ใช้", path: "/system/users", icon: Users },
      { title: "จัดการสิทธิ์", path: "/system/roles", icon: ShieldCheck },
    ],
  },
];

/**
 * Owner utility nav (bottom of sidebar).
 * Healholic V1: /app/settings is a legacy localStorage prototype and is NOT
 * exposed in production navigation. The page source is retained.
 */
export const OWNER_UTILITY_NAV: NavItem[] = [];

/**
 * Owner mobile bottom-nav quick-switch items.
 * "ตั้งค่า" (prototype /app/settings) is intentionally omitted from the
 * bottom bar to avoid surfacing a localStorage-only page on the most
 * prominent mobile navigation surface.
 */
export const OWNER_MOBILE_NAV: NavItem[] = [
  { title: "ภาพรวม", path: "/owner/dashboard", icon: LayoutDashboard },
  { title: "POS", path: "/staff/kiosk", icon: MonitorSmartphone, end: true },
  { title: "รายงาน", path: "/owner/reports", icon: BarChart3 },
  { title: "ออเดอร์", path: "/staff/orders", icon: ClipboardList },
  { title: "เมนู", path: "/owner/menus", icon: Soup },
];

/* ── Staff ────────────────────────────────────────────────────────────── */

/**
 * Staff navigation — focused operational scope.
 *
 * V1 staff see only: POS (Kiosk) + Orders.
 * Owner/manager configuration pages are NOT listed here. If a staff member
 * navigates to an owner route by URL, the existing ManagerRoute guard
 * denies access — no change to backend permissions is required.
 */
export const STAFF_NAV_SECTIONS: NavSection[] = [
  {
    title: "งานประจำวัน",
    items: [
      { title: "POS (Kiosk)", path: "/staff/kiosk", icon: MonitorSmartphone, end: true },
      { title: "ออเดอร์", path: "/staff/orders", icon: ClipboardList },
    ],
  },
];

/* ── Admin (System Operator) ──────────────────────────────────────────── */

/**
 * System Console navigation — used by SystemLayout.
 *
 * Visible to `owner` and `admin` (SYSTEM_CONSOLE_ROLES).
 */
export const SYSTEM_NAV_SECTIONS: NavSection[] = [
  {
    title: "System Console",
    items: [
      { title: "ภาพรวมระบบ", path: "/system", icon: Terminal, end: true },
      { title: "ตรวจสอบระบบ", path: "/system/health", icon: Activity },
      { title: "บันทึกเหตุการณ์", path: "/system/audit-logs", icon: FileText },
      { title: "จัดการผู้ใช้", path: "/system/users", icon: Users },
      { title: "จัดการสิทธิ์", path: "/system/roles", icon: ShieldCheck },
    ],
  },
];

/**
 * Admin navigation — shown in AdminLayout/AppLayout when an admin views
 * business pages. Admins get the same business nav as owners plus a link
 * back to the System Console.
 */
export const ADMIN_NAV_SECTIONS: NavSection[] = [
  {
    title: "System Console",
    items: [
      { title: "ภาพรวมระบบ", path: "/system", icon: Terminal, end: true },
    ],
  },
  {
    title: "ภาพรวมธุรกิจ",
    items: [
      { title: "แดชบอร์ดธุรกิจ", path: "/owner/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "POS และออเดอร์",
    items: [
      { title: "POS (Kiosk)", path: "/staff/kiosk", icon: MonitorSmartphone, end: true },
      { title: "ออเดอร์ (ติดตามภาพรวม)", path: "/staff/orders", icon: ClipboardList },
    ],
  },
  {
    title: "เมนูและสูตร",
    items: [
      { title: "เมนูและหมวดหมู่", path: "/owner/menus", icon: Soup },
      { title: "สูตรและต้นทุน", path: "/owner/recipes", icon: BookOpenCheck },
    ],
  },
  {
    title: "วัตถุดิบและสต็อก",
    items: [
      { title: "วัตถุดิบ / สต็อก", path: "/owner/cost-items", icon: Package },
    ],
  },
  {
    title: "ผลประกอบการ",
    items: [
      { title: "รายงานสรุป", path: "/owner/reports", icon: BarChart3 },
    ],
  },
  {
    title: "การจัดการร้าน",
    items: [
      { title: "ตั้งค่าการชำระเงิน", path: "/owner/payment-settings", icon: CreditCard },
    ],
  },
];

/** Admin mobile bottom-nav quick-switch items. */
export const ADMIN_MOBILE_NAV: NavItem[] = [
  { title: "ระบบ", path: "/system", icon: Terminal, end: true },
  { title: "แดชบอร์ด", path: "/owner/dashboard", icon: LayoutDashboard },
  { title: "POS", path: "/staff/kiosk", icon: MonitorSmartphone, end: true },
  { title: "ออเดอร์", path: "/staff/orders", icon: ClipboardList },
  { title: "รายงาน", path: "/owner/reports", icon: BarChart3 },
];

/* ── Helpers ──────────────────────────────────────────────────────────── */

/**
 * Returns the nav sections visible to a given role, filtering items by their
 * optional `roles` array. Sections with zero visible items are removed.
 */
export function resolveNavSections(
  sections: NavSection[],
  role: AppRole,
): NavSection[] {
  return sections
    .map((section) => ({
      title: section.title,
      items: section.items.filter((item) => {
        if (!item.roles?.length) return true;
        if (!role) return false;
        return item.roles.includes(role);
      }),
    }))
    .filter((section) => section.items.length > 0);
}

/** Whether a role should see the owner-level navigation. */
export function isManagerRole(role: AppRole): boolean {
  return role ? MANAGER_NAV_ROLES.includes(role) : false;
}

/** Whether a role is the system operator (admin). */
export function isAdminRole(role: AppRole): boolean {
  return role === "admin";
}
