import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Loader2, ImageOff, Upload, Trash2, ShieldCheck } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import LoadingState from "@/components/shared/LoadingState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { storeAdminApi, type StorePaymentSettings, type StorePaymentSettingsUpdatePayload } from "@/services/storeAdminApi";

const QR_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
const QR_ACCEPT_STRING = QR_ALLOWED_TYPES.join(",");
const QR_MAX_MB = 5;
const QR_MAX_BYTES = QR_MAX_MB * 1024 * 1024;

const DEFAULT_FORM = {
  displayName: "",
  promptpayEnabled: true,
  cashEnabled: true,
};

type FormState = typeof DEFAULT_FORM;

type BannerState = { tone: "success" | "error"; message: string } | null;

function normalizeDisplayName(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function formFromSettings(settings: StorePaymentSettings | null): FormState {
  if (!settings) {
    return DEFAULT_FORM;
  }
  return {
    displayName: settings.promptpay_display_name ?? "",
    promptpayEnabled: Boolean(settings.is_promptpay_enabled),
    cashEnabled: Boolean(settings.is_cash_enabled),
  };
}

function resolveErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "request_failed");
  if (raw === "one_payment_method_required") {
    return "ต้องเปิดอย่างน้อย 1 วิธีชำระเงิน";
  }
  if (raw === "no_fields_to_update") {
    return "ยังไม่มีการเปลี่ยนแปลง";
  }
  if (raw === "file_type_not_allowed") {
    return "ไฟล์ต้องเป็น PNG, JPG, WEBP หรือ SVG";
  }
  if (raw === "file_too_large") {
    return `ไฟล์ต้องไม่เกิน ${QR_MAX_MB}MB`;
  }
  if (raw === "empty_file") {
    return "ไม่พบไฟล์ที่อัปโหลด";
  }
  return raw || "ดำเนินการไม่สำเร็จ";
}

export default function OwnerPaymentSettingsPage() {
  const [settings, setSettings] = useState<StorePaymentSettings | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingQr, setDeletingQr] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await storeAdminApi.getPaymentSettings();
      setSettings(res.settings);
      setForm(formFromSettings(res.settings));
    } catch (err) {
      setLoadError(resolveErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const isDirty = useMemo(() => {
    if (!settings) return false;
    const currentDisplay = normalizeDisplayName(settings.promptpay_display_name);
    const pendingDisplay = normalizeDisplayName(form.displayName);
    return (
      form.promptpayEnabled !== settings.is_promptpay_enabled ||
      form.cashEnabled !== settings.is_cash_enabled ||
      currentDisplay !== pendingDisplay
    );
  }, [form, settings]);

  const preventSave = saving || uploading || deletingQr || !settings || !isDirty;
  const atLeastOneMethod = form.promptpayEnabled || form.cashEnabled;

  useEffect(() => {
    if (atLeastOneMethod) {
      setValidationError(null);
    }
  }, [atLeastOneMethod]);

  function handleToggle(key: keyof Pick<FormState, "promptpayEnabled" | "cashEnabled">, value: boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleDisplayNameChange(event: ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, displayName: event.target.value }));
  }

  async function handleSave() {
    if (!settings) return;
    if (!atLeastOneMethod) {
      setValidationError("ต้องเปิดอย่างน้อย 1 วิธีชำระเงิน");
      return;
    }

    const payload: StorePaymentSettingsUpdatePayload = {};
    const normalizedDisplay = normalizeDisplayName(form.displayName);
    const sanitizedDisplay = normalizedDisplay ? normalizedDisplay : null;
    if (normalizeDisplayName(settings.promptpay_display_name) !== normalizedDisplay) {
      payload.promptpay_display_name = sanitizedDisplay;
    }
    if (form.promptpayEnabled !== settings.is_promptpay_enabled) {
      payload.is_promptpay_enabled = form.promptpayEnabled;
    }
    if (form.cashEnabled !== settings.is_cash_enabled) {
      payload.is_cash_enabled = form.cashEnabled;
    }

    if (!Object.keys(payload).length) {
      setBanner({ tone: "error", message: "ยังไม่มีการเปลี่ยนแปลง" });
      return;
    }

    setSaving(true);
    setBanner(null);
    try {
      const res = await storeAdminApi.updatePaymentSettings(payload);
      setSettings(res.settings);
      setForm(formFromSettings(res.settings));
      const message = "บันทึกการตั้งค่าสำเร็จ";
      setBanner({ tone: "success", message });
      toast({ title: "บันทึกสำเร็จ", description: message });
    } catch (err) {
      const message = resolveErrorMessage(err);
      setBanner({ tone: "error", message });
      setValidationError(message.includes("ต้องเปิดอย่างน้อย") ? message : null);
    } finally {
      setSaving(false);
    }
  }

  function handleUploadButtonClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileError(null);

    if (!QR_ALLOWED_TYPES.includes(file.type)) {
      setFileError("ไฟล์ต้องเป็น PNG, JPG, WEBP หรือ SVG");
      return;
    }
    if (file.size > QR_MAX_BYTES) {
      setFileError(`ไฟล์ต้องไม่เกิน ${QR_MAX_MB}MB`);
      return;
    }

    setUploading(true);
    setBanner(null);
    try {
      const res = await storeAdminApi.uploadPaymentSettingsQr(file);
      setSettings(res.settings);
      setForm(formFromSettings(res.settings));
      setBanner({ tone: "success", message: "อัปโหลด QR สำเร็จ" });
      toast({ title: "อัปโหลดสำเร็จ", description: "QR ถูกอัปเดตแล้ว" });
    } catch (err) {
      setFileError(resolveErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteQr() {
    if (!settings?.promptpay_qr_url) return;
    setDeletingQr(true);
    setBanner(null);
    try {
      const res = await storeAdminApi.deletePaymentSettingsQr();
      setSettings(res.settings);
      setForm(formFromSettings(res.settings));
      setBanner({ tone: "success", message: "ลบ QR เรียบร้อย" });
      toast({ title: "ลบ QR เรียบร้อย", description: "ระบบลบรูปปัจจุบันให้แล้ว" });
    } catch (err) {
      setBanner({ tone: "error", message: resolveErrorMessage(err) });
    } finally {
      setDeletingQr(false);
    }
  }

  function renderBanner() {
    if (!banner) return null;
    const isError = banner.tone === "error";
    return (
      <Alert
        variant={isError ? "destructive" : "default"}
        className={isError ? "border-destructive/70" : "border-emerald-200 bg-emerald-50 text-emerald-900"}
      >
        <AlertTitle>{isError ? "ไม่สามารถบันทึกได้" : "สำเร็จ"}</AlertTitle>
        <AlertDescription>{banner.message}</AlertDescription>
      </Alert>
    );
  }

  function renderContent() {
    if (loading) {
      return <LoadingState label="กำลังดึงการตั้งค่าการชำระเงิน..." />;
    }

    if (loadError) {
      return (
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTitle>โหลดข้อมูลไม่สำเร็จ</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
          <Button onClick={() => void fetchSettings()} variant="outline">
            <RefreshIcon />
            ลองอีกครั้ง
          </Button>
        </div>
      );
    }

    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>ตัวเลือกการชำระเงิน</CardTitle>
            <CardDescription>กำหนดว่าร้านเปิดรับ PromptPay / เงินสด และชื่อที่แสดงบน QR</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <MethodToggle
                title="PromptPay พร้อม QR"
                description="ลูกค้าสแกนและกรอกยอดเอง"
                checked={form.promptpayEnabled}
                onCheckedChange={(checked) => handleToggle("promptpayEnabled", checked)}
                disabled={saving || uploading}
                id="promptpay-toggle"
              />
              <MethodToggle
                title="รับเงินสดหน้าร้าน"
                description="ให้พนักงานบันทึกเงินสดที่เคาน์เตอร์"
                checked={form.cashEnabled}
                onCheckedChange={(checked) => handleToggle("cashEnabled", checked)}
                disabled={saving || uploading}
                id="cash-toggle"
              />
              {validationError ? (
                <p className="text-sm text-destructive" data-testid="payment-validation">
                  {validationError}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="display-name">ชื่อที่แสดงใต้ QR (ถ้ามี)</Label>
              <Input
                id="display-name"
                value={form.displayName}
                onChange={handleDisplayNameChange}
                placeholder="ชื่อบัญชี PromptPay"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                ชื่อตรงนี้ช่วยให้ลูกค้าตรวจสอบว่ากำลังโอนเงินเข้าบัญชีที่ถูกต้อง
              </p>
            </div>

            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>แนวทางการใช้ QR ร้าน</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  <li>QR ร้านแบบไม่ระบุยอด</li>
                  <li>ลูกค้าต้องกรอกยอดให้ตรงกับยอดที่แสดง</li>
                  <li>พนักงานตรวจสลิปก่อนกดยืนยัน</li>
                </ul>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>QR PromptPay</CardTitle>
            <CardDescription>รองรับไฟล์ PNG, JPG, WEBP, SVG ขนาดไม่เกิน {QR_MAX_MB}MB</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-hidden rounded-xl border bg-muted/40">
              {settings?.promptpay_qr_url ? (
                <img
                  src={settings.promptpay_qr_url}
                  alt={settings.promptpay_qr_file_name || "PromptPay QR"}
                  className="block w-full object-contain bg-white"
                />
              ) : (
                <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                  <ImageOff className="h-10 w-10" />
                  <div>
                    <p className="font-medium text-foreground">ยังไม่มีรูป QR</p>
                    <p className="text-sm">อัปโหลดไฟล์เพื่อให้ลูกค้าสแกนได้ทันที</p>
                  </div>
                </div>
              )}
            </div>
            {settings?.promptpay_qr_file_name ? (
              <p className="text-xs text-muted-foreground">ไฟล์ล่าสุด: {settings.promptpay_qr_file_name}</p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={handleUploadButtonClick} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {settings?.promptpay_qr_url ? "เปลี่ยนรูป QR" : "อัปโหลด QR"}
              </Button>
              {settings?.promptpay_qr_url ? (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive border-destructive/40"
                  onClick={() => void handleDeleteQr()}
                  disabled={deletingQr}
                >
                  {deletingQr ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  ลบรูป QR
                </Button>
              ) : null}
            </div>
            {fileError ? <p className="text-sm text-destructive">{fileError}</p> : null}
            <input
              ref={fileInputRef}
              type="file"
              accept={QR_ACCEPT_STRING}
              className="hidden"
              onChange={handleFileChange}
              data-testid="qr-file-input"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">การจัดการร้าน</p>
            <h1 className="text-3xl font-bold leading-tight">ตั้งค่าการชำระเงิน</h1>
            <p className="text-sm text-muted-foreground">กำหนดการเปิดใช้งาน PromptPay / เงินสด และจัดการรูป QR ของร้าน</p>
          </div>
          <Button type="button" onClick={() => void handleSave()} disabled={preventSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            บันทึกการตั้งค่า
          </Button>
        </div>

        {renderBanner()}
        {renderContent()}
      </div>
    </AppLayout>
  );
}

function MethodToggle({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  id,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border px-4 py-3">
      <div className="pr-4">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={title} />
    </div>
  );
}

function RefreshIcon() {
  return <Loader2 className="h-4 w-4" role="presentation" />;
}
