import AppLayout from "@/components/AppLayout";
import { useState, useMemo } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import {
  invoiceService,
  submissionService,
} from "@/services/billingService";
import {
  formatTHB,
  formatDateTime,
  formatPlanLabel,
  formatCycleLabel,
} from "@/lib/format";
import {
  ArrowLeft,
  QrCode,
  CreditCard,
  Upload,
  CheckCircle2,
  AlertCircle,
  Copy,
} from "lucide-react";

export default function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const invoiceId = searchParams.get("invoice");
  
  const invoice = useMemo(
    () => (invoiceId ? invoiceService.getById(invoiceId) : null),
    [invoiceId]
  );

  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 16));
  const [paidAmount, setPaidAmount] = useState(invoice?.amount.toString() ?? "");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice) return;
    if (!paidAmount || !paidAt) {
      setError("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      submissionService.create(
        invoice.invoice_id,
        Number(paidAmount),
        new Date(paidAt).toISOString(),
        proofUrl
      );
      setIsSubmitting(false);
      setSuccess(true);
    }, 1500);
  };

  const copyRef = () => {
    if (invoice?.reference_code) {
      navigator.clipboard.writeText(invoice.reference_code);
      alert("คัดลอก Reference Code แล้ว");
    }
  };

  if (success) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto py-12 text-center space-y-6">
          <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto text-success">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">แจ้งชำระเงินสำเร็จ</h1>
            <p className="text-muted-foreground">
              เราได้รับข้อมูลการชำระเงินของคุณแล้ว ทีมงานจะทำการตรวจสอบและเริ่มใช้งานแผนของคุณภายใน 1 วันทำการ
            </p>
          </div>
          <Link
            to="/app/billing"
            className="block w-full bg-primary text-primary-foreground py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
            ไปที่หน้าการสมัครสมาชิก
          </Link>
        </div>
      </AppLayout>
    );
  }

  if (!invoice) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto py-12 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">ไม่พบข้อมูลใบแจ้งหนี้ กรุณาลองใหม่อีกครั้งจากหน้าเลือกแผน</p>
          <Link to="/pricing" className="text-accent underline">กลับไปหน้าเลือกแผน</Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* ── Page Header ─────────────────────────────── */}
        <div className="page-header">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="page-title">ชำระเงินและแจ้งโอน</h1>
              <p className="page-subtitle">โอนเงินแล้วแนบสลิปโอนที่นี่เพื่อเร่งการตรวจสอบ</p>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Step 1: Payment Instructions */}
          <div className="space-y-6">
            <div className="stat-card space-y-6">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                <h2 className="font-bold text-foreground">โอนเงินเข้าบัญชีธนาคาร</h2>
              </div>

              <div className="bg-muted p-6 rounded-xl space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border shadow-sm">
                    <QrCode className="w-6 h-6 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-foreground">ธนาคารกสิกรไทย (K-Bank)</p>
                    <p className="text-lg font-mono text-primary font-bold">012-3-45678-9</p>
                    <p className="text-sm text-muted-foreground">ชื่อบัญชี: บจก. วาลอร่า ดีไซน์ (Valora Design Co., Ltd.)</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-muted-foreground/10 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">ยอดที่ต้องโอน:</span>
                    <span className="text-xl font-bold text-foreground tabular-nums">{formatTHB(invoice.amount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Reference Code:</span>
                    <button onClick={copyRef} className="flex items-center gap-1.5 font-mono text-xs text-primary font-bold bg-white px-2 py-1 rounded border hover:bg-muted-foreground/5 transition-colors">
                      {invoice.reference_code} <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-muted-foreground p-3 border rounded-lg">
                <AlertCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                <p>กรุณาระบุ <strong>Reference Code</strong> ในช่องบันทึกช่วยจำ (Memo) ขณะโอนเงิน เพื่อความรวดเร็วในการตรวจสอบ</p>
              </div>
            </div>

            <div className="stat-card">
              <h2 className="font-bold text-foreground mb-4">สรุปใบแจ้งหนี้</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">แผน</dt>
                  <dd className="font-semibold">{formatPlanLabel(invoice.plan)} ({formatCycleLabel(invoice.billing_cycle)})</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">สถานะ</dt>
                  <dd className="text-foreground">ยังไม่ชำระ</dd>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <dt className="font-bold">ยอดสุทธิ</dt>
                  <dd className="font-bold text-lg">{formatTHB(invoice.amount)}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Step 2: Form */}
          <div className="space-y-6">
            <form onSubmit={handleSubmit} className="stat-card space-y-6">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                <h2 className="font-bold text-foreground">แจ้งรายละเอียดการโอนเงิน</h2>
              </div>

              <div className="space-y-4">
                <div className="form-group">
                  <label className="form-label">จำนวนเงินที่โอน (฿) *</label>
                  <input
                    type="number"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    required
                    className="form-input tabular-nums"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">วันและเวลาที่โอน *</label>
                  <input
                    type="datetime-local"
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    required
                    className="form-input tabular-nums"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">แนบหลักฐานการโอน (สลิป)</label>
                  <div className="relative border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:bg-muted/50 transition-colors cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    {proofUrl ? (
                      <div className="text-center">
                        <img src={proofUrl} alt="Preview" className="max-h-32 mb-2 rounded mx-auto" />
                        <p className="text-xs text-primary font-medium">เปลี่ยนไฟล์</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-muted-foreground" />
                        <div className="text-center">
                          <p className="text-sm font-medium">กดเพื่อเลือกไฟล์หรือลากมาวางที่นี่</p>
                          <p className="text-xs text-muted-foreground mt-1">ไฟล์ภาพ JPG, PNG (ไม่เกิน 2MB)</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary text-primary-foreground py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? "กำลังส่งข้อมูล..." : "แจ้งชำระเงิน"}
              </button>

              <div className="p-4 bg-muted/50 rounded-lg flex items-start gap-3">
                <CreditCard className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  รายการของคุณจะเข้าสู่กระบวนการตรวจสอบโดย Payment Gateway (future simulation) ร่วมกับบุคลากรของเรา ระบบจะเปิดใช้งานเมื่อยอดเงินเข้าสู่บัญชีเรียบร้อยแล้ว
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
