export const LOGIN_ERROR_MESSAGES = {
  emptyCredentials: "กรุณากรอกอีเมลและรหัสผ่าน",
  emptyEmail: "กรุณากรอกอีเมล",
  emptyPassword: "กรุณากรอกรหัสผ่าน",
  invalidCredentials: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  unexpected: "ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง",
} as const;

export const FORGOT_PASSWORD_SUCCESS_MESSAGE =
  "หากอีเมลนี้อยู่ในระบบ เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้แล้ว";

export function getLoginValidationMessage(emailInput: string, passwordInput: string): string | null {
  const email = emailInput.trim();

  if (!email && !passwordInput) {
    return LOGIN_ERROR_MESSAGES.emptyCredentials;
  }

  if (!email) {
    return LOGIN_ERROR_MESSAGES.emptyEmail;
  }

  if (!passwordInput) {
    return LOGIN_ERROR_MESSAGES.emptyPassword;
  }

  return null;
}
