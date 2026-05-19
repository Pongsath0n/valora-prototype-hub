import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

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
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) { setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง"); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("ไม่สามารถตรวจสอบสิทธิ์ได้"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (profile?.role !== "owner" && profile?.role !== "admin") {
        await supabase.auth.signOut();
        setError("Access Denied: พื้นที่นี้ใช้สำหรับผู้ดูแลระบบเท่านั้น หากต้องการใช้งานระบบร้าน กรุณาเข้าสู่ระบบผ่าน Client Access");
        return;
      }
      navigate("/admin", { replace: true });
    } catch { setError("เกิดข้อผิดพลาด กรุณาลองใหม่"); } finally { setIsLoading(false); }
  };

  return <div className="min-h-screen bg-background flex items-center justify-center px-4"><div className="w-full max-w-sm"><div className="stat-card space-y-6"><div className="text-center space-y-2"><div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto"><ShieldCheck className="w-6 h-6 text-primary-foreground" /></div><p className="text-xs uppercase tracking-wider text-muted-foreground">Admin Access</p><h1 className="text-xl font-bold text-foreground">เข้าสู่ระบบผู้ดูแล</h1><p className="text-sm text-muted-foreground">สำหรับเจ้าของระบบหรือผู้ดูแลระบบที่ต้องการเข้าสู่ศูนย์ควบคุมระบบ Valora</p></div><form onSubmit={handleSubmit} className="space-y-4"><div className="form-group"><label className="form-label">อีเมล</label><input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} placeholder="admin@company.com" required autoComplete="email" className="form-input" /></div><div className="form-group"><label className="form-label">รหัสผ่าน</label><input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="กรอกรหัสผ่าน" required autoComplete="current-password" className="form-input" /></div>{error && <div className="flex items-center gap-2 text-destructive bg-destructive/10 px-3 py-2.5 rounded-lg text-sm"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span></div>}<button type="submit" disabled={isLoading} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">{isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังตรวจสอบ...</> : "เข้าสู่ระบบ"}</button></form><p className="text-center text-xs text-muted-foreground">พื้นที่นี้ใช้สำหรับผู้ดูแลระบบเท่านั้น หากต้องการใช้งานระบบร้าน กรุณาเข้าสู่ระบบผ่าน Client Access</p></div></div></div>;
}
