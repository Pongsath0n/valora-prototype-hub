import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { AlertCircle, Loader2 } from "lucide-react";
import LogoBrand from "@/components/LogoBrand";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(
          authError.message === "Invalid login credentials"
            ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
            : authError.message
        );
        return;
      }

      // Check if user has completed Onboarding
      const hasOnboarded = localStorage.getItem("valora:onboarded") === "1";
      navigate(hasOnboarded ? "/app/dashboard" : "/onboarding", { replace: true });
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <LogoBrand size="md" />
          </div>
          <h1 className="text-2xl font-bold text-foreground leading-snug">เข้าสู่ระบบ Valora</h1>
          <p className="text-sm text-muted-foreground mt-1">
            กรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งาน
          </p>
        </div>

        <form onSubmit={handleLogin} className="stat-card space-y-5">
          <div className="form-group">
            <label className="form-label">อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
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
              onChange={(e) => setPassword(e.target.value)}
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
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังตรวจสอบ...
              </>
            ) : (
              "เข้าสู่ระบบ"
            )}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-4">
          ยังไม่มีบัญชี?{" "}
          <Link to="/auth/signup" className="text-accent font-medium hover:underline">
            สมัครใช้งาน
          </Link>
        </p>
      </div>
    </div>
  );
}
