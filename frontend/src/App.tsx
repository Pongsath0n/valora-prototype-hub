import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RoleProvider } from "@/contexts/RoleContext";
import { BUSINESS_PORTAL_ROLES, STORE_ADMIN_ROLES, SYSTEM_CONSOLE_ROLES, useRoleGuard } from "@/lib/guards";

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

import SystemOverviewPage from "./pages/system/SystemOverview";
import SystemUsersPage from "./pages/system/SystemUsers";
import SystemRolesPage from "./pages/system/SystemRoles";
import SystemAuditLogsPage from "./pages/system/SystemAuditLogs";
import SystemHealthPage from "./pages/system/SystemHealth";
import SystemStoragePage from "./pages/system/SystemStorage";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (!user) return <Navigate to="/client-access" replace />;
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

function SystemRoute({ children }: { children: React.ReactNode }) {
  // TODO: introduce a dedicated `internal_system` role; until then, only `owner` can access.
  const { checking, accessDenied } = useRoleGuard(SYSTEM_CONSOLE_ROLES);
  if (checking) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (accessDenied) return <div className="min-h-screen flex items-center justify-center text-xl font-semibold">Access Denied</div>;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/client-access" element={<Login />} />

      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      {/* Store Admin Dashboard */}
      <Route path="/store-admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
      <Route path="/store-admin/menus" element={<AdminRoute><AdminProductsPage /></AdminRoute>} />
      <Route path="/store-admin/ingredients" element={<AdminRoute><StoreAdminIngredientsPage /></AdminRoute>} />
      <Route path="/store-admin/recipes" element={<AdminRoute><StoreAdminRecipesPage /></AdminRoute>} />
      <Route path="/store-admin/channels" element={<AdminRoute><AdminSalesChannelsPage /></AdminRoute>} />
      <Route path="/store-admin/channel-pricing" element={<BusinessRoute><StoreAdminChannelPricingPage /></BusinessRoute>} />
      <Route path="/store-admin/pos" element={<AdminRoute><StoreAdminPOSPage /></AdminRoute>} />
      <Route path="/store-admin/orders" element={<AdminRoute><AdminOrdersPage /></AdminRoute>} />
      <Route path="/store-admin/orders/:id" element={<AdminRoute><AdminOrderDetailPage /></AdminRoute>} />
      <Route path="/store-admin/customers" element={<AdminRoute><CustomersPage /></AdminRoute>} />
      <Route path="/store-admin/reports" element={<AdminRoute><StoreAdminReportsPage /></AdminRoute>} />

      <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
      <Route path="/admin/orders" element={<AdminRoute><AdminOrdersPage /></AdminRoute>} />
      <Route path="/admin/orders/:id" element={<AdminRoute><AdminOrderDetailPage /></AdminRoute>} />
      <Route path="/admin/products" element={<AdminRoute><AdminProductsPage /></AdminRoute>} />
      <Route path="/admin/store" element={<AdminRoute><AdminStoreSettingsPage /></AdminRoute>} />
      <Route path="/admin/sales-channels" element={<AdminRoute><AdminSalesChannelsPage /></AdminRoute>} />

      {/* Internal System Console */}
      <Route path="/system" element={<SystemRoute><SystemOverviewPage /></SystemRoute>} />
      <Route path="/system/users" element={<SystemRoute><SystemUsersPage /></SystemRoute>} />
      <Route path="/system/roles" element={<SystemRoute><SystemRolesPage /></SystemRoute>} />
      <Route path="/system/health" element={<SystemRoute><SystemHealthPage /></SystemRoute>} />
      <Route path="/system/storage" element={<SystemRoute><SystemStoragePage /></SystemRoute>} />
      <Route path="/system/audit-logs" element={<SystemRoute><SystemAuditLogsPage /></SystemRoute>} />

      <Route path="/app/dashboard" element={<ProtectedRoute><BusinessRoute><Dashboard /></BusinessRoute></ProtectedRoute>} />
      <Route path="/app/scenario" element={<ProtectedRoute><Scenario /></ProtectedRoute>} />
      <Route path="/app/promo" element={<ProtectedRoute><Promo /></ProtectedRoute>} />
      <Route path="/app/delivery" element={<ProtectedRoute><Delivery /></ProtectedRoute>} />
      <Route path="/app/reports" element={<ProtectedRoute><BusinessRoute><Reports /></BusinessRoute></ProtectedRoute>} />
      <Route path="/app/menu" element={<ProtectedRoute><MenuManagement /></ProtectedRoute>} />
      <Route path="/app/ingredients" element={<ProtectedRoute><IngredientsStock /></ProtectedRoute>} />
      <Route path="/app/recipes" element={<ProtectedRoute><RecipeCosting /></ProtectedRoute>} />
      <Route path="/app/channels" element={<ProtectedRoute><SalesChannels /></ProtectedRoute>} />
      <Route path="/app/channel-pricing" element={<ProtectedRoute><ChannelPricing /></ProtectedRoute>} />
      <Route path="/app/pos" element={<ProtectedRoute><POSManualOrder /></ProtectedRoute>} />
      <Route path="/app/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
      <Route path="/app/orders/:id" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
      <Route path="/app/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

      <Route path="/order" element={<CustomerMenuPage />} />
      <Route path="/order/status" element={<OrderStatusPage />} />
      <Route path="/privacy" element={<PrivacyNoticePage />} />
      <Route path="/liff/menu" element={<CustomerMenuPage />} />
      <Route path="/liff/menu/:id" element={<MenuDetailPage />} />
      <Route path="/liff/cart" element={<CartPage />} />
      <Route path="/liff/confirm" element={<OrderConfirmPage />} />
      <Route path="/liff/success" element={<OrderSuccessPage />} />

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
