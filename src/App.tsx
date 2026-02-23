import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Scenario from "./pages/Scenario";
import Promo from "./pages/Promo";
import Delivery from "./pages/Delivery";
import Reports from "./pages/Reports";
import Pricing from "./pages/Pricing";
import Settings from "./pages/Settings";
import AdminLogin from "./pages/admin/AdminLogin";
import ApprovalsList from "./pages/admin/ApprovalsList";
import ApprovalDetail from "./pages/admin/ApprovalDetail";
import BillingStatus from "./pages/billing/BillingStatus";
import Checkout from "./pages/checkout/Checkout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/app/dashboard" element={<Dashboard />} />
          <Route path="/app/scenario" element={<Scenario />} />
          <Route path="/app/promo" element={<Promo />} />
          <Route path="/app/delivery" element={<Delivery />} />
          <Route path="/app/reports" element={<Reports />} />
          <Route path="/app/settings" element={<Settings />} />
          <Route path="/app/billing" element={<BillingStatus />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/approvals" element={<ApprovalsList />} />
          <Route path="/admin/approvals/:requestId" element={<ApprovalDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
