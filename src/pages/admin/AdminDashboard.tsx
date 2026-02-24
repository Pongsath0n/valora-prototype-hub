import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAdminGuard, adminLogout } from "@/lib/guards";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  LogOut, Users, Banknote, Crown, TrendingUp, ClipboardList, Loader2,
} from "lucide-react";
import LogoBrand from "@/components/LogoBrand";

interface DashboardStats {
  totalMembers: number;
  totalRevenue: number;
  planBreakdown: { plan: string; count: number; label: string }[];
  pendingApprovals: number;
}

export default function AdminDashboardPage() {
  const { checking } = useAdminGuard();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (checking) return;
    loadStats();
  }, [checking]);

  const loadStats = async () => {
    setLoading(true);
    try {
      // 1. Total members
      const { count: totalMembers } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // 2. Plan breakdown
      const { data: profiles } = await supabase
        .from("profiles")
        .select("current_plan");

      const planCounts: Record<string, number> = {};
      (profiles ?? []).forEach((p: { current_plan: string | null }) => {
        const plan = p.current_plan ?? "free";
        planCounts[plan] = (planCounts[plan] || 0) + 1;
      });

      const planLabels: Record<string, string> = {
        free: "Free",
        starter: "Starter",
        pro: "Pro",
      };

      const planBreakdown = Object.entries(planCounts).map(([plan, count]) => ({
        plan,
        count,
        label: planLabels[plan] ?? plan,
      }));

      // 3. Total revenue (sum of paid_amount where status = VERIFIED)
      const { data: payments } = await supabase
        .from("payment_submissions")
        .select("paid_amount")
        .eq("status", "VERIFIED");

      const totalRevenue = (payments ?? []).reduce(
        (sum: number, p: { paid_amount: number }) => sum + (p.paid_amount || 0),
        0
      );

      // 4. Pending approvals count
      const { count: pendingApprovals } = await supabase
        .from("payment_submissions")
        .select("*", { count: "exact", head: true })
        .eq("status", "PAYMENT_SUBMITTED");

      setStats({
        totalMembers: totalMembers ?? 0,
        totalRevenue,
        planBreakdown,
        pendingApprovals: pendingApprovals ?? 0,
      });
    } catch (err) {
      console.error("Failed to load admin stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await adminLogout();
    navigate("/admin/login");
  };

  if (checking || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          กำลังโหลด...
        </div>
      </div>
    );
  }

  const planColors: Record<string, string> = {
    free: "bg-muted text-muted-foreground",
    starter: "bg-accent/10 text-accent",
    pro: "bg-primary/10 text-primary",
  };

  const totalForBar = stats?.totalMembers ?? 1;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoBrand size="sm" iconOnly />
            <span className="font-bold text-foreground">Valora Admin</span>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              Dashboard
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Page Title */}
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">ภาพรวมระบบ Valora</p>
        </div>

        {/* ── KPI Cards ───────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Members */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground font-medium">สมาชิกทั้งหมด</span>
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-accent" />
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground tabular-nums">
              {stats?.totalMembers ?? 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">ผู้ใช้ที่สมัครทั้งหมด</p>
          </div>

          {/* Total Revenue */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground font-medium">รายได้รวม</span>
              <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
                <Banknote className="w-5 h-5 text-success" />
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground tabular-nums">
              ฿{(stats?.totalRevenue ?? 0).toLocaleString("th-TH")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">ยอดชำระที่ยืนยันแล้ว</p>
          </div>

          {/* Paid Plans */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground font-medium">แผนชำระเงิน</span>
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Crown className="w-5 h-5 text-primary" />
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground tabular-nums">
              {stats?.planBreakdown
                .filter((p) => p.plan !== "free")
                .reduce((sum, p) => sum + p.count, 0) ?? 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Starter + Pro</p>
          </div>

          {/* Pending Approvals */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground font-medium">รอตรวจสอบ</span>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                (stats?.pendingApprovals ?? 0) > 0
                  ? "bg-warning/10"
                  : "bg-muted"
              }`}>
                <ClipboardList className={`w-5 h-5 ${
                  (stats?.pendingApprovals ?? 0) > 0
                    ? "text-warning"
                    : "text-muted-foreground"
                }`} />
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground tabular-nums">
              {stats?.pendingApprovals ?? 0}
            </p>
            <Link
              to="/admin/approvals"
              className="text-xs text-accent hover:underline mt-1 inline-block"
            >
              ไปหน้า Approvals →
            </Link>
          </div>
        </div>

        {/* ── Plan Breakdown ──────────────────────────── */}
        <div className="stat-card space-y-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent" />
            <h2 className="section-title">สมาชิกแต่ละแผน</h2>
          </div>

          <div className="space-y-4">
            {(stats?.planBreakdown ?? [])
              .sort((a, b) => b.count - a.count)
              .map((item) => {
                const pct = totalForBar > 0 ? (item.count / totalForBar) * 100 : 0;
                return (
                  <div key={item.plan} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${planColors[item.plan] ?? "bg-muted text-muted-foreground"}`}>
                          {item.label}
                        </span>
                        <span className="text-sm text-foreground font-medium tabular-nums">
                          {item.count} ราย
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${
                          item.plan === "pro"
                            ? "bg-primary"
                            : item.plan === "starter"
                              ? "bg-accent"
                              : "bg-muted-foreground/30"
                        }`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>

          {(stats?.planBreakdown.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              ยังไม่มีสมาชิกในระบบ
            </p>
          )}
        </div>

        {/* ── Quick Links ─────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/admin/approvals"
            className="stat-card flex items-center gap-3 hover:border-accent/40 transition-colors group"
          >
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
              <ClipboardList className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">รายการ Approvals</p>
              <p className="text-xs text-muted-foreground">ตรวจสอบและอนุมัติการชำระเงิน</p>
            </div>
          </Link>

          <button
            onClick={() => loadStats()}
            className="stat-card flex items-center gap-3 hover:border-accent/40 transition-colors group text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center group-hover:bg-success/20 transition-colors">
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">รีเฟรชข้อมูล</p>
              <p className="text-xs text-muted-foreground">ดึงข้อมูลล่าสุดจาก Supabase</p>
            </div>
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Valora Admin Dashboard — ข้อมูลจาก Supabase
        </p>
      </div>
    </div>
  );
}
