import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { storeAdminApi } from "@/services/storeAdminApi";
import { resolvePostLoginRoute } from "@/lib/postLogin";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import LogoBrand from "@/components/LogoBrand";
import {
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
  LOGIN_ERROR_MESSAGES,
  getLoginValidationMessage,
} from "./loginMessages";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);

  const showError = (message: string) => setFeedback({ type: "error", message });
  const showSuccess = (message: string) => setFeedback({ type: "success", message });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setFeedback(null);

    const validationMessage = getLoginValidationMessage(email, password);
    if (validationMessage) {
      showError(validationMessage);
      return;
    }

    setIsLoading(true);

    try {
      const trimmedEmail = email.trim();
      const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (authError) {
        showError(
          authError.message === "Invalid login credentials"
            ? LOGIN_ERROR_MESSAGES.invalidCredentials
            : LOGIN_ERROR_MESSAGES.unexpected
        );
        return;
      }

      const userId = signInData?.user?.id;
      if (!userId) {
        showError(LOGIN_ERROR_MESSAGES.unexpected);
        return;
      }

      try {
        const me = await storeAdminApi.getMe();
        const role = (me.role ?? null) as string | null;
        if (!role) {
          showError("บัญชีนี้ยังไม่ได้รับสิทธิ์การใช้งาน");
          return;
        }

        const hasOnboarded = localStorage.getItem("valora:onboarded") === "1";
        navigate(resolvePostLoginRoute(role, hasOnboarded), { replace: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const permissionErrors = new Set([
          "no_store_membership",
          "insufficient_role",
          "store_access_denied",
          "owner_role_required",
          "unauthorized",
        ]);
        if (permissionErrors.has(message)) {
          showError("บัญชีนี้ยังไม่ได้รับสิทธิ์การใช้งาน");
        } else {
          showError(LOGIN_ERROR_MESSAGES.unexpected);
        }
      }
    } catch {
      showError(LOGIN_ERROR_MESSAGES.unexpected);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (isResettingPassword || isLoading) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showError(LOGIN_ERROR_MESSAGES.emptyEmail);
      return;
    }

    setFeedback(null);
    setIsResettingPassword(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
      if (resetError) throw resetError;
      showSuccess(FORGOT_PASSWORD_SUCCESS_MESSAGE);
    } catch {
      showError(LOGIN_ERROR_MESSAGES.unexpected);
    } finally {
      setIsResettingPassword(false);
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

          <div className="text-right">
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={isResettingPassword || isLoading}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
            >
              {isResettingPassword ? "กำลังส่งลิงก์..." : "ลืมรหัสผ่าน?"}
            </button>
          </div>

          {feedback && (
            <div
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                feedback.type === "error"
                  ? "text-destructive bg-destructive/10"
                  : "text-emerald-600 bg-emerald-50 dark:text-emerald-100 dark:bg-emerald-500/10"
              }`}
            >
              {feedback.type === "error" ? (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
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

        
      </div>
    </div>
  );
}
