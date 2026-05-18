import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// Public pages
import Landing from "./pages/Landing";
import Overview from "./pages/Overview";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import Pricing from "./pages/Pricing";

// Protected app pages
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Scenario from "./pages/Scenario";
import Promo from "./pages/Promo";
import Delivery from "./pages/Delivery";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import BillingStatus from "./pages/billing/BillingStatus";
import Checkout from "./pages/checkout/Checkout";

import MenuManagement from "./pages/MenuManagement";
import IngredientsStock from "./pages/IngredientsStock";
import RecipeCosting from "./pages/RecipeCosting";
import SalesChannels from "./pages/SalesChannels";
import ChannelPricing from "./pages/ChannelPricing";
import POSManualOrder from "./pages/POSManualOrder";
import OrdersPage from "./pages/Orders";
import OrderDetailPage from "./pages/OrderDetail";

// Admin pages
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ApprovalsList from "./pages/admin/ApprovalsList";
import ApprovalDetail from "./pages/admin/ApprovalDetail";

const queryClient = new QueryClient();

// ─── Protected Route Wrapper ──────────────────────────────────────────────────
// Redirects to /auth/login while loading or unauthenticated.
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">กำลังโหลด...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  return <>{children}</>;
}

// ─── App Routes ───────────────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/overview" element={<Overview />} />
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/signup" element={<Signup />} />
      <Route path="/pricing" element={<Pricing />} />

      {/* Protected — require login */}
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
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
      <Route path="/app/billing" element={<ProtectedRoute><BillingStatus /></ProtectedRoute>} />
      <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />

      {/* Admin (separate auth) */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/dashboard" element={<AdminDashboard />} />
      <Route path="/admin/approvals" element={<ApprovalsList />} />
      <Route path="/admin/approvals/:requestId" element={<ApprovalDetail />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
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

export default App;
