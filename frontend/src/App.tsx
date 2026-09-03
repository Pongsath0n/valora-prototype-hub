import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RoleProvider, useProfileRole } from "@/contexts/RoleContext";
import { BUSINESS_PORTAL_ROLES, STORE_ADMIN_ROLES, SYSTEM_CONSOLE_ROLES, STORE_MANAGER_ROLES, useRoleGuard } from "@/lib/guards";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Scenario from "./pages/Scenario";
import Promo from "./pages/Promo";
import Delivery from "./pages/Delivery";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import MenuManagement from "./pages/MenuManagement";
import IngredientsStock from "./pages/IngredientsStock";
import RecipeCosting from "./pages/RecipeCosting";
import SalesChannels from "./pages/SalesChannels";
import ChannelPricing from "./pages/ChannelPricing";
import StoreAdminChannelPricingPage from "./pages/store-admin/ChannelPricing";
import POSManualOrder from "./pages/POSManualOrder";
import OrdersPage from "./pages/Orders";
import OrderDetailPage from "./pages/OrderDetail";

import CustomerMenuPage from "./pages/liff/CustomerMenu";
import MenuDetailPage from "./pages/liff/MenuDetail";
import CartPage from "./pages/liff/Cart";
import OrderConfirmPage from "./pages/liff/OrderConfirm";
import OrderSuccessPage from "./pages/liff/OrderSuccess";
import OrderStatusPage from "./pages/order/OrderStatusPage";
import PrivacyNoticePage from "./pages/PrivacyNotice";
import CustomerThemeLayout from "./components/customer/CustomerThemeLayout";

import AdminDashboardPage from "./pages/admin/AdminDashboard";
import AdminOrdersPage from "./pages/admin/AdminOrders";
import AdminOrderDetailPage from "./pages/admin/AdminOrderDetail";
import AdminProductsPage from "./pages/admin/AdminProducts";
import AdminStoreSettingsPage from "./pages/admin/AdminStoreSettings";
import CustomersPage from "./pages/store-admin/CustomersPage";
import AdminSalesChannelsPage from "./pages/admin/AdminSalesChannels";
import StoreAdminIngredientsPage from "./pages/store-admin/Ingredients";
import StoreAdminRecipesPage from "./pages/store-admin/Recipes";
import StoreAdminPOSPage from "./pages/store-admin/POS";
import StoreAdminReportsPage from "./pages/store-admin/Reports";
import StaffKioskPage from "./pages/staff/Kiosk";
import OwnerPaymentSettingsPage from "./pages/OwnerPaymentSettings";

import SystemOverviewPage from "./pages/system/SystemOverview";
import SystemUsersPage from "./pages/system/SystemUsers";
import SystemRolesPage from "./pages/system/SystemRoles";
import SystemAuditLogsPage from "./pages/system/SystemAuditLogs";
import SystemHealthPage from "./pages/system/SystemHealth";

const queryClient = new QueryClient();
const shouldRedirectStoreReports = !import.meta.env.DEV;
/**
 * POS is a prototype/local tool (localStorage only — no backend orders, payments,
 * or report sync). It is deferred from production workflows until a real
 * Manual Sales Entry / Sales Import feature exists. In production builds the
 * POS routes redirect to safe canonical destinations.
 */
export function isPosDeferred(isDevBuild: boolean): boolean {
  return !isDevBuild;
}
const shouldDeferPos = isPosDeferred(Boolean(import.meta.env.DEV));

/**
 * Legacy /app/* config pages (menu, channels, channel-pricing, ingredients,
 * recipes) read Supabase but WRITE only to localStorage — they are prototypes.
 * The canonical, backend-backed config workspace is /store-admin/*.
 * In production the legacy routes redirect to canonical so two pages can never
 * update two different data sources.
 */
export function shouldRedirectLegacyConfig(isDevBuild: boolean): boolean {
  return !isDevBuild;
}
const redirectLegacyConfig = shouldRedirectLegacyConfig(Boolean(import.meta.env.DEV));

function legacyOrCanonical(legacyElement: React.ReactNode, canonicalPath: string) {
  return redirectLegacyConfig ? <Navigate to={canonicalPath} replace /> : legacyElement;
}

/**
 * Promo and Delivery are localStorage-only prototype dashboards that render
 * fabricated/mock data and are NOT production-ready. In production they redirect
 * to a safe owner page; in DEV they remain reachable for internal testing (and
 * render a clear "prototype/testing only" banner). Reuses the same DEV/prod gate
 * as the legacy config prototypes.
 */
function prototypeOrRedirect(prototypeElement: React.ReactNode, fallbackPath = "/owner/dashboard") {
  return redirectLegacyConfig ? <Navigate to={fallbackPath} replace /> : prototypeElement;
}

/** Legacy alias: /app/scenario → canonical Profit Planning route. */
export function ScenarioLegacyRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/owner/profit-planning", search: location.search, hash: location.hash }} replace />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { checking, accessDenied } = useRoleGuard(STORE_ADMIN_ROLES);
  if (checking) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (accessDenied) return <div className="min-h-screen flex items-center justify-center text-xl font-semibold">Access Denied</div>;
  return <>{children}</>;
}

function BusinessRoute({ children }: { children: React.ReactNode }) {
  const { checking, accessDenied } = useRoleGuard(BUSINESS_PORTAL_ROLES);
  if (checking) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (accessDenied) return <div className="min-h-screen flex items-center justify-center text-xl font-semibold">Access Denied</div>;
  return <>{children}</>;
}

function ManagerRoute({ children }: { children: React.ReactNode }) {
  const { checking, accessDenied } = useRoleGuard(STORE_MANAGER_ROLES);
  if (checking) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (accessDenied) return <div className="min-h-screen flex items-center justify-center text-xl font-semibold">Access Denied</div>;
  return <>{children}</>;
}

function SystemRoute({ children }: { children: React.ReactNode }) {
  // TODO: introduce a dedicated `internal_system` role; until then, only `owner` can access.
  const { checking, accessDenied } = useRoleGuard(SYSTEM_CONSOLE_ROLES);
  if (checking) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (accessDenied) return <div className="min-h-screen flex items-center justify-center text-xl font-semibold">Access Denied</div>;
  return <>{children}</>;
}

export function AdminLegacyRedirect() {
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useProfileRole();
  const legacyMatch = location.pathname.match(/^\/admin(.*)$/);
  const suffix = legacyMatch?.[1] ?? "";

  if (!suffix || suffix === "/") {
    if (authLoading || roleLoading) {
      return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
    }
    if (!user) return <Navigate to="/login" replace />;
    if (role === "staff") return <Navigate to="/staff" replace />;
    return <Navigate to="/owner/dashboard" replace />;
  }

  const targetPath = `/store-admin${suffix}` || "/store-admin";
  return <Navigate to={{ pathname: targetPath, search: location.search, hash: location.hash }} replace />;
}

function StaffOrderDetailRedirect() {
  const { id } = useParams();
  return <Navigate to={`/staff/orders/${id}`} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/client-access" element={<Navigate to="/login" replace />} />
      <Route path="/auth/login" element={<Navigate to="/login" replace />} />
      <Route path="/auth/signup" element={<Navigate to="/login" replace />} />

      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/dashboard" element={<Navigate to="/owner/dashboard" replace />} />

      {/* ── Canonical Staff routes ── */}
      <Route path="/staff" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
      <Route path="/staff/orders" element={<AdminRoute><AdminOrdersPage /></AdminRoute>} />
      <Route path="/staff/orders/:id" element={<AdminRoute><AdminOrderDetailPage /></AdminRoute>} />
      <Route path="/staff/customers" element={<AdminRoute><CustomersPage /></AdminRoute>} />
      <Route path="/staff/kiosk" element={<AdminRoute><StaffKioskPage /></AdminRoute>} />

      {/* ── Canonical Owner routes ── */}
      <Route path="/owner/dashboard" element={<ProtectedRoute><BusinessRoute><Dashboard /></BusinessRoute></ProtectedRoute>} />
      <Route path="/owner/profit-planning" element={<ProtectedRoute><BusinessRoute><Scenario /></BusinessRoute></ProtectedRoute>} />
      {/* e2e-manager-route-marker path="/owner/reports" element={<ManagerRoute> */}
      <Route path="/owner/reports" element={<ProtectedRoute><BusinessRoute><ManagerRoute><Reports /></ManagerRoute></BusinessRoute></ProtectedRoute>} />
      <Route path="/owner/menus" element={<ManagerRoute><AdminProductsPage /></ManagerRoute>} />
      <Route path="/owner/recipes" element={<ManagerRoute><StoreAdminRecipesPage /></ManagerRoute>} />
      <Route path="/owner/cost-items" element={<ManagerRoute><StoreAdminIngredientsPage /></ManagerRoute>} />
      <Route
        path="/owner/payment-settings"
        element={<ManagerRoute><OwnerPaymentSettingsPage /></ManagerRoute>}
      />

      {/* ── Legacy /store-admin redirects → canonical ── */}
      <Route path="/store-admin" element={<Navigate to="/staff" replace />} />
      <Route path="/store-admin/orders" element={<Navigate to="/staff/orders" replace />} />
      <Route path="/store-admin/orders/:id" element={<StaffOrderDetailRedirect />} />
      <Route path="/store-admin/customers" element={<Navigate to="/staff/customers" replace />} />
      <Route path="/store-admin/menus" element={<Navigate to="/owner/menus" replace />} />
      <Route path="/store-admin/recipes" element={<Navigate to="/owner/recipes" replace />} />
      <Route path="/store-admin/ingredients" element={<Navigate to="/owner/cost-items" replace />} />
      {/* store-admin routes NOT in approved taxonomy — remain as-is */}
      <Route path="/store-admin/channels" element={<ManagerRoute><AdminSalesChannelsPage /></ManagerRoute>} />
      <Route path="/store-admin/channel-pricing" element={<ManagerRoute><StoreAdminChannelPricingPage /></ManagerRoute>} />
      <Route path="/store-admin/pos" element={<AdminRoute>{shouldDeferPos ? <Navigate to="/staff" replace /> : <StoreAdminPOSPage />}</AdminRoute>} />
      <Route
        path="/store-admin/reports"
        element={
          shouldRedirectStoreReports ? (
            <ManagerRoute>
              <Navigate to="/owner/reports" replace />
            </ManagerRoute>
          ) : (
            <ManagerRoute>
              <StoreAdminReportsPage />
            </ManagerRoute>
          )
        }
      />

      <Route path="/admin/*" element={<AdminLegacyRedirect />} />

      {/* Internal System Console */}
      <Route path="/system" element={<SystemRoute><SystemOverviewPage /></SystemRoute>} />
      <Route path="/system/users" element={<SystemRoute><SystemUsersPage /></SystemRoute>} />
      <Route path="/system/roles" element={<SystemRoute><SystemRolesPage /></SystemRoute>} />
      <Route path="/system/health" element={<SystemRoute><SystemHealthPage /></SystemRoute>} />
      <Route path="/system/storage" element={<Navigate to="/system/health#storage" replace />} />
      <Route path="/system/audit-logs" element={<SystemRoute><SystemAuditLogsPage /></SystemRoute>} />

      {/* ── Legacy /app/* redirects → canonical ── */}
      <Route path="/app/dashboard" element={<Navigate to="/owner/dashboard" replace />} />
      <Route path="/app/planning" element={<Navigate to="/owner/profit-planning" replace />} />
      <Route path="/app/scenario" element={<ScenarioLegacyRedirect />} />
      <Route path="/app/reports" element={<Navigate to="/owner/reports" replace />} />
      {/* /app/* routes NOT in approved taxonomy — remain as-is */}
      <Route path="/app/promo" element={prototypeOrRedirect(<ProtectedRoute><BusinessRoute><Promo /></BusinessRoute></ProtectedRoute>)} />
      <Route path="/app/delivery" element={prototypeOrRedirect(<ProtectedRoute><BusinessRoute><Delivery /></BusinessRoute></ProtectedRoute>)} />
      <Route path="/app/menu" element={legacyOrCanonical(<ProtectedRoute><BusinessRoute><MenuManagement /></BusinessRoute></ProtectedRoute>, "/owner/menus")} />
      <Route path="/app/ingredients" element={legacyOrCanonical(<ProtectedRoute><BusinessRoute><IngredientsStock /></BusinessRoute></ProtectedRoute>, "/owner/cost-items")} />
      <Route path="/app/recipes" element={legacyOrCanonical(<ProtectedRoute><BusinessRoute><RecipeCosting /></BusinessRoute></ProtectedRoute>, "/owner/recipes")} />
      <Route path="/app/channels" element={legacyOrCanonical(<ProtectedRoute><BusinessRoute><SalesChannels /></BusinessRoute></ProtectedRoute>, "/store-admin/channels")} />
      <Route path="/app/channel-pricing" element={legacyOrCanonical(<ProtectedRoute><BusinessRoute><ChannelPricing /></BusinessRoute></ProtectedRoute>, "/store-admin/channel-pricing")} />
      <Route
        path="/app/pos"
        element={
          shouldDeferPos ? (
            <Navigate to="/owner/profit-planning" replace />
          ) : (
            <ProtectedRoute><BusinessRoute><POSManualOrder /></BusinessRoute></ProtectedRoute>
          )
        }
      />
      <Route
        path="/app/orders"
        element={
          shouldDeferPos ? (
            <Navigate to="/staff/orders" replace />
          ) : (
            <ProtectedRoute><BusinessRoute><OrdersPage /></BusinessRoute></ProtectedRoute>
          )
        }
      />
      <Route
        path="/app/orders/:id"
        element={
          shouldDeferPos ? (
            <Navigate to="/staff/orders" replace />
          ) : (
            <ProtectedRoute><BusinessRoute><OrderDetailPage /></BusinessRoute></ProtectedRoute>
          )
        }
      />
      <Route path="/app/settings" element={<ProtectedRoute><BusinessRoute><Settings /></BusinessRoute></ProtectedRoute>} />

      <Route path="/order" element={<CustomerThemeLayout><CustomerMenuPage /></CustomerThemeLayout>} />
      <Route path="/order/status" element={<CustomerThemeLayout showCart={false}><OrderStatusPage /></CustomerThemeLayout>} />
      <Route path="/privacy" element={<CustomerThemeLayout showCart={false}><PrivacyNoticePage /></CustomerThemeLayout>} />
      <Route path="/liff/menu" element={<CustomerThemeLayout><CustomerMenuPage /></CustomerThemeLayout>} />
      <Route path="/liff/menu/:id" element={<CustomerThemeLayout><MenuDetailPage /></CustomerThemeLayout>} />
      <Route path="/liff/cart" element={<CustomerThemeLayout><CartPage /></CustomerThemeLayout>} />
      <Route path="/liff/confirm" element={<CustomerThemeLayout showCart={false}><OrderConfirmPage /></CustomerThemeLayout>} />
      <Route path="/liff/success" element={<CustomerThemeLayout showCart={false}><OrderSuccessPage /></CustomerThemeLayout>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <RoleProvider>
              <AppRoutes />
            </RoleProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
