import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useRoleGuard } from "@/lib/guards";

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

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (!user) return <Navigate to="/client-access" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { checking, accessDenied } = useRoleGuard(["owner", "admin"]);
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
      <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />

      <Route path="/app/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/app/scenario" element={<ProtectedRoute><Scenario /></ProtectedRoute>} />
      <Route path="/app/promo" element={<ProtectedRoute><Promo /></ProtectedRoute>} />
      <Route path="/app/delivery" element={<ProtectedRoute><Delivery /></ProtectedRoute>} />
      <Route path="/app/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/app/menu" element={<ProtectedRoute><MenuManagement /></ProtectedRoute>} />
      <Route path="/app/ingredients" element={<ProtectedRoute><IngredientsStock /></ProtectedRoute>} />
      <Route path="/app/recipes" element={<ProtectedRoute><RecipeCosting /></ProtectedRoute>} />
      <Route path="/app/channels" element={<ProtectedRoute><SalesChannels /></ProtectedRoute>} />
      <Route path="/app/channel-pricing" element={<ProtectedRoute><ChannelPricing /></ProtectedRoute>} />
      <Route path="/app/pos" element={<ProtectedRoute><POSManualOrder /></ProtectedRoute>} />
      <Route path="/app/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
      <Route path="/app/orders/:id" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
      <Route path="/app/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

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
