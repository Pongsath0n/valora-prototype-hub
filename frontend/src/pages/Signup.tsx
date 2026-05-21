import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import LogoBrand from "@/components/LogoBrand";

export default function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("รหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง");
      return;
    }
    if (password.length < 8) {
      setError("รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร");
      return;
    }

    setIsLoading(true);
    try {
      const { error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
        },
      });

      if (authError) {
        if (authError.message.includes("already registered")) {
          setError("อีเมลนี้ถูกใช้งานแล้ว กรุณาลองด้วยอีเมลอื่น");
        } else {
          setError(authError.message);
        }
        return;
      }

      setSuccess(true);
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9 text-success" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">สมัครสมาชิกสำเร็จ!</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              เราได้ส่งลิงก์ยืนยันอีเมลไปที่{" "}
              <span className="font-semibold text-foreground">{email}</span>
              <br />
              กรุณาคลิกลิงก์ในอีเมลก่อนเข้าสู่ระบบ
            </p>
          </div>
          <button
            onClick={() => navigate("/auth/login")}
            className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            ไปหน้าเข้าสู่ระบบ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <LogoBrand size="md" />
          </div>
          <h1 className="text-2xl font-bold text-foreground leading-snug">สมัครใช้งาน Valora</h1>
          <p className="text-sm text-muted-foreground mt-1">
            เริ่มต้นวิเคราะห์ต้นทุนร้านของคุณได้เลย
          </p>
        </div>

        <form onSubmit={handleSignup} className="stat-card space-y-5">
          <div className="form-group">
            <label className="form-label">ชื่อ-นามสกุล (หรือชื่อร้าน)</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="เช่น สมชาย คาเฟ่"
              required
              autoComplete="name"
              className="form-input"
            />
          </div>

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
              placeholder="อย่างน้อย 8 ตัวอักษร"
              required
              autoComplete="new-password"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">ยืนยันรหัสผ่าน</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="พิมพ์รหัสผ่านอีกครั้ง"
              required
              autoComplete="new-password"
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
                กำลังสมัครสมาชิก...
              </>
            ) : (
              "สมัครใช้งานฟรี"
            )}
          </button>

          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
            การสมัครสมาชิกถือว่าคุณยอมรับ{" "}
            <span className="text-accent">ข้อกำหนดการใช้งาน</span> และ{" "}
            <span className="text-accent">นโยบายความเป็นส่วนตัว</span> ของเรา
          </p>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-4">
          มีบัญชีอยู่แล้ว?{" "}
          <Link to="/auth/login" className="text-accent font-medium hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </div>
  );
}
