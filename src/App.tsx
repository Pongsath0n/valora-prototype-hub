import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppRole, useRoleGuard } from "@/lib/guards";

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
import POSManualOrder from "./pages/POSManualOrder";
import OrdersPage from "./pages/Orders";
import OrderDetailPage from "./pages/OrderDetail";
import CustomerMenuPage from "./pages/liff/CustomerMenu";
import MenuDetailPage from "./pages/liff/MenuDetail";
import CartPage from "./pages/liff/Cart";
import OrderConfirmPage from "./pages/liff/OrderConfirm";
import OrderSuccessPage from "./pages/liff/OrderSuccess";
import AdminDashboardPage from "./pages/admin/AdminDashboard";
import ApprovalsList from "./pages/admin/ApprovalsList";
import ApprovalDetail from "./pages/admin/ApprovalDetail";
import InsightsPage from "./pages/Insights";
import AdminUsersPage from "./pages/admin/AdminUsers";
import AdminRolesPage from "./pages/admin/AdminRoles";
import AdminStorePage from "./pages/admin/AdminStore";
import AdminSystemPage from "./pages/admin/AdminSystem";
import AdminAuditLogsPage from "./pages/admin/AdminAuditLogs";
import AdminLoginPage from "./pages/admin/AdminLogin";


const queryClient = new QueryClient();

function RoleProtectedRoute({ children, allowedRoles, redirectTo }: { children: React.ReactNode; allowedRoles: AppRole[]; redirectTo?: string }) {
  const { checking, accessDenied } = useRoleGuard(allowedRoles, { redirectTo });
  if (checking) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (accessDenied) return <div className="min-h-screen flex items-center justify-center text-xl font-semibold">Access Denied</div>;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/client-access" element={<Login />} />
      <Route path="/admin-access" element={<AdminLoginPage />} />

      <Route path="/onboarding" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><Onboarding /></RoleProtectedRoute>} />
      <Route path="/dashboard" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><Dashboard /></RoleProtectedRoute>} />
      <Route path="/dashboard/insights" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager"]} redirectTo="/client-access"><InsightsPage /></RoleProtectedRoute>} />
      <Route path="/admin" element={<RoleProtectedRoute allowedRoles={["owner", "admin"]} redirectTo="/admin-access"><AdminDashboardPage /></RoleProtectedRoute>} />
      <Route path="/admin/approvals" element={<RoleProtectedRoute allowedRoles={["owner", "admin"]} redirectTo="/admin-access"><ApprovalsList /></RoleProtectedRoute>} />
      <Route path="/admin/approvals/:requestId" element={<RoleProtectedRoute allowedRoles={["owner", "admin"]} redirectTo="/admin-access"><ApprovalDetail /></RoleProtectedRoute>} />
      <Route path="/admin/users" element={<RoleProtectedRoute allowedRoles={["owner", "admin"]} redirectTo="/admin-access"><AdminUsersPage /></RoleProtectedRoute>} />
      <Route path="/admin/roles" element={<RoleProtectedRoute allowedRoles={["owner", "admin"]} redirectTo="/admin-access"><AdminRolesPage /></RoleProtectedRoute>} />
      <Route path="/admin/store" element={<RoleProtectedRoute allowedRoles={["owner", "admin"]} redirectTo="/admin-access"><AdminStorePage /></RoleProtectedRoute>} />
      <Route path="/admin/sales-channels" element={<RoleProtectedRoute allowedRoles={["owner", "admin"]} redirectTo="/admin-access"><SalesChannels /></RoleProtectedRoute>} />
      <Route path="/admin/system" element={<RoleProtectedRoute allowedRoles={["owner", "admin"]} redirectTo="/admin-access"><AdminSystemPage /></RoleProtectedRoute>} />
      <Route path="/admin/audit-logs" element={<RoleProtectedRoute allowedRoles={["owner", "admin"]} redirectTo="/admin-access"><AdminAuditLogsPage /></RoleProtectedRoute>} />


      <Route path="/menus" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><MenuManagement /></RoleProtectedRoute>} />
      <Route path="/ingredients" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><IngredientsStock /></RoleProtectedRoute>} />
      <Route path="/recipes" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><RecipeCosting /></RoleProtectedRoute>} />
      <Route path="/sales-channels" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><SalesChannels /></RoleProtectedRoute>} />
      <Route path="/pos" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><POSManualOrder /></RoleProtectedRoute>} />
      <Route path="/orders" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><OrdersPage /></RoleProtectedRoute>} />
      <Route path="/reports" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><Reports /></RoleProtectedRoute>} />
      <Route path="/app/dashboard" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><Dashboard /></RoleProtectedRoute>} />
      <Route path="/app/scenario" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><Scenario /></RoleProtectedRoute>} />
      <Route path="/app/promo" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><Promo /></RoleProtectedRoute>} />
      <Route path="/app/delivery" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><Delivery /></RoleProtectedRoute>} />
      <Route path="/app/reports" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><Reports /></RoleProtectedRoute>} />
      <Route path="/app/menu" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><MenuManagement /></RoleProtectedRoute>} />
      <Route path="/app/ingredients" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><IngredientsStock /></RoleProtectedRoute>} />
      <Route path="/app/recipes" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><RecipeCosting /></RoleProtectedRoute>} />
      <Route path="/app/channels" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><SalesChannels /></RoleProtectedRoute>} />
      <Route path="/app/channel-pricing" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><ChannelPricing /></RoleProtectedRoute>} />
      <Route path="/app/pos" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><POSManualOrder /></RoleProtectedRoute>} />
      <Route path="/app/orders" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><OrdersPage /></RoleProtectedRoute>} />
      <Route path="/app/orders/:id" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><OrderDetailPage /></RoleProtectedRoute>} />
      <Route path="/app/settings" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]} redirectTo="/client-access"><Settings /></RoleProtectedRoute>} />

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
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
