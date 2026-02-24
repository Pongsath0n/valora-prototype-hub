import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, LogIn, AlertCircle, Loader2 } from "lucide-react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // 1. Authenticate via Supabase
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
        return;
      }

      // 2. Check if user has admin role
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("ไม่สามารถตรวจสอบสิทธิ์ได้");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "admin") {
        // Sign out non-admin users immediately
        await supabase.auth.signOut();
        setError("บัญชีนี้ไม่มีสิทธิ์เข้าถึงระบบ Admin");
        return;
      }

      navigate("/admin/dashboard", { replace: true });
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="stat-card space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Admin — Valora</h1>
            <p className="text-sm text-muted-foreground">เข้าสู่ระบบสำหรับผู้ดูแล</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label className="form-label">อีเมล Admin</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder="admin@valora.app"
                autoFocus
                required
                autoComplete="email"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">รหัสผ่าน</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="กรอกรหัสผ่าน"
                required
                autoComplete="current-password"
                className="form-input"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive bg-destructive/10 px-3 py-2.5 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังตรวจสอบ...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" /> เข้าสู่ระบบ
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            ระบบนี้สำหรับทีมงาน Valora เท่านั้น
          </p>
        </div>
      </div>
    </div>
  );
}
