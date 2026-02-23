import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin } from "@/lib/guards";
import { ShieldCheck, LogIn } from "lucide-react";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminLogin(password)) {
      navigate("/admin/approvals", { replace: true });
    } else {
      setError("รหัสผ่านไม่ถูกต้อง");
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
              <label className="form-label">รหัสผ่านผู้ดูแลระบบ</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="กรอกรหัสผ่าน"
                autoFocus
                className="form-input"
              />
              {error && (
                <p className="text-xs text-destructive mt-1.5">{error}</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <LogIn className="w-4 h-4" /> เข้าสู่ระบบ
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
