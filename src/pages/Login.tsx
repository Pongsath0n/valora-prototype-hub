import { Link } from "react-router-dom";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-xl">V</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">เข้าสู่ระบบ Valora</h1>
          <p className="text-sm text-muted-foreground mt-1">กรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งาน</p>
        </div>

        <div className="stat-card space-y-5">
          <div className="form-group">
            <label className="form-label">อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
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
              className="form-input"
            />
          </div>
          <Link
            to="/app/dashboard"
            className="w-full block text-center bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            เข้าสู่ระบบ
          </Link>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          ยังไม่มีบัญชี?{" "}
          <Link to="/onboarding" className="text-accent font-medium hover:underline">สมัครใช้งาน</Link>
        </p>
      </div>
    </div>
  );
}
