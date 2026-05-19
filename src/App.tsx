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

const queryClient = new QueryClient();

function RoleProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: AppRole[] }) {
  const { checking, accessDenied } = useRoleGuard(allowedRoles);
  if (checking) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (accessDenied) return <div className="min-h-screen flex items-center justify-center text-xl font-semibold">Access Denied</div>;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/client-access" element={<Login />} />

      <Route path="/onboarding" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><Onboarding /></RoleProtectedRoute>} />
      <Route path="/dashboard" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><Dashboard /></RoleProtectedRoute>} />
      <Route path="/dashboard/insights" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager"]}><InsightsPage /></RoleProtectedRoute>} />
      <Route path="/admin" element={<RoleProtectedRoute allowedRoles={["owner", "admin"]}><AdminDashboardPage /></RoleProtectedRoute>} />
      <Route path="/admin/approvals" element={<RoleProtectedRoute allowedRoles={["owner", "admin"]}><ApprovalsList /></RoleProtectedRoute>} />
      <Route path="/admin/approvals/:requestId" element={<RoleProtectedRoute allowedRoles={["owner", "admin"]}><ApprovalDetail /></RoleProtectedRoute>} />

      <Route path="/app/dashboard" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><Dashboard /></RoleProtectedRoute>} />
      <Route path="/app/scenario" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><Scenario /></RoleProtectedRoute>} />
      <Route path="/app/promo" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><Promo /></RoleProtectedRoute>} />
      <Route path="/app/delivery" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><Delivery /></RoleProtectedRoute>} />
      <Route path="/app/reports" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><Reports /></RoleProtectedRoute>} />
      <Route path="/app/menu" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><MenuManagement /></RoleProtectedRoute>} />
      <Route path="/app/ingredients" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><IngredientsStock /></RoleProtectedRoute>} />
      <Route path="/app/recipes" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><RecipeCosting /></RoleProtectedRoute>} />
      <Route path="/app/channels" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><SalesChannels /></RoleProtectedRoute>} />
      <Route path="/app/channel-pricing" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><ChannelPricing /></RoleProtectedRoute>} />
      <Route path="/app/pos" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><POSManualOrder /></RoleProtectedRoute>} />
      <Route path="/app/orders" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><OrdersPage /></RoleProtectedRoute>} />
      <Route path="/app/orders/:id" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><OrderDetailPage /></RoleProtectedRoute>} />
      <Route path="/app/settings" element={<RoleProtectedRoute allowedRoles={["owner", "admin", "manager", "staff"]}><Settings /></RoleProtectedRoute>} />

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
