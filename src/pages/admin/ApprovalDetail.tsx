import { useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAdminGuard } from "@/lib/guards";
import { useAuth } from "@/contexts/AuthContext";
import { getApprovalRow, approvePayment, rejectPayment } from "@/services/adminService";
import {
  formatTHB,
  formatDateTime,
  formatPlanLabel,
  formatCycleLabel,
  formatSubmissionStatus,
  submissionStatusColor,
  formatInvoiceStatus,
} from "@/lib/format";
import { PLAN_PRICES } from "@/services/billingService";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, FileImage, ShieldCheck, Loader2,
} from "lucide-react";

export default function ApprovalDetailPage() {
  const { checking } = useAdminGuard();
  const { user } = useAuth();
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();

  const adminEmail = user?.email ?? "admin@valora.app";

  const [adminNote, setAdminNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const row = requestId ? getApprovalRow(requestId) : null;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void refreshKey; // consumed to trigger re-render

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          กำลังตรวจสอบสิทธิ์...
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">ไม่พบข้อมูลการชำระเงิน</p>
          <Link to="/admin/approvals" className="text-sm text-accent hover:underline">
            กลับรายการ
          </Link>
        </div>
      </div>
    );
  }

  const { submission, invoice } = row;
  const expectedAmount = PLAN_PRICES[invoice.plan][invoice.billing_cycle] *
    (invoice.billing_cycle === "yearly" ? 12 : 1);
  const isPending = submission.status === "PAYMENT_SUBMITTED";

  const handleVerify = () => {
    const result = approvePayment(submission.submission_id, adminEmail, adminNote);
    if (result.ok === false) {
      setErrorMsg(result.error);
      return;
    }
    setSuccessMsg("ยืนยันการชำระเงินสำเร็จ — แผนของผู้ใช้ถูก Activate แล้ว");
    refresh();
  };

  const handleReject = () => {
    setErrorMsg("");
    const result = rejectPayment(submission.submission_id, adminEmail, rejectReason);
    if (result.ok === false) {
      setErrorMsg(result.error);
      return;
    }
    setSuccessMsg("ปฏิเสธการชำระเงินแล้ว");
    setShowRejectForm(false);
    refresh();
  };

  // Re-read after mutation
  const current = requestId ? getApprovalRow(requestId) : null;
  const currentSub = current?.submission ?? submission;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/admin/approvals" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="font-bold text-foreground">รายละเอียดการชำระเงิน</span>
          <span className="font-mono text-xs text-muted-foreground">
            #{submission.submission_id}
          </span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Success / Error banners */}
        {successMsg && (
          <div className="flex items-center gap-3 bg-success/10 border border-success/30 rounded-lg px-4 py-3 text-sm text-success font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive font-medium">
            <XCircle className="w-4 h-4 flex-shrink-0" /> {errorMsg}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Invoice & User info */}
          <div className="space-y-5">
            {/* Invoice */}
            <div className="stat-card space-y-4">
              <h2 className="section-title">ข้อมูลใบแจ้งหนี้</h2>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Invoice ID</dt>
                  <dd className="font-mono text-foreground">{invoice.invoice_id}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">แผน</dt>
                  <dd className="font-semibold text-foreground">{formatPlanLabel(invoice.plan)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">รอบชำระ</dt>
                  <dd className="text-foreground">{formatCycleLabel(invoice.billing_cycle)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">ยอดที่คาดว่าจะชำระ</dt>
                  <dd className="font-bold text-foreground tabular-nums">{formatTHB(expectedAmount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Reference Code</dt>
                  <dd className="font-mono text-foreground text-xs">{invoice.reference_code}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">สถานะ Invoice</dt>
                  <dd className="text-foreground">{formatInvoiceStatus(invoice.status)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">วันที่สร้าง</dt>
                  <dd className="text-foreground tabular-nums text-xs">{formatDateTime(invoice.created_at)}</dd>
                </div>
              </dl>
            </div>

            {/* Submission */}
            <div className="stat-card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="section-title">ข้อมูลการแจ้งชำระ</h2>
                <span className={`status-badge ${submissionStatusColor(currentSub.status)}`}>
                  {formatSubmissionStatus(currentSub.status)}
                </span>
              </div>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">ผู้ใช้</dt>
                  <dd className="font-medium text-foreground">{currentSub.user_email ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">ยอดที่แจ้ง</dt>
                  <dd className={`font-bold tabular-nums ${
                    currentSub.paid_amount !== expectedAmount ? "text-warning" : "text-foreground"
                  }`}>
                    {formatTHB(currentSub.paid_amount)}
                    {currentSub.paid_amount !== expectedAmount && (
                      <span className="text-xs font-normal ml-1">(ไม่ตรงกับที่คาด)</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">วันที่โอน</dt>
                  <dd className="text-foreground tabular-nums text-xs">{formatDateTime(currentSub.paid_at)}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Right: Proof + Actions */}
          <div className="space-y-5">
            {/* Proof image */}
            <div className="stat-card space-y-3">
              <h2 className="section-title">หลักฐานการชำระเงิน</h2>
              {currentSub.proof_url ? (
                <div className="rounded-lg overflow-hidden border">
                  <img
                    src={currentSub.proof_url}
                    alt="หลักฐานการโอนเงิน"
                    className="w-full max-h-64 object-contain"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg text-muted-foreground gap-2">
                  <FileImage className="w-6 h-6" />
                  <span className="text-sm">ไม่มีไฟล์หลักฐาน</span>
                </div>
              )}
            </div>

            {/* Admin Actions */}
            {isPending && !successMsg && (
              <div className="stat-card space-y-4">
                <h2 className="section-title">การดำเนินการ</h2>

                {/* Note */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    หมายเหตุ Admin (ไม่บังคับ สำหรับ Verify)
                  </label>
                  <textarea
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="เช่น ตรวจสอบสลิปแล้ว ตรงกับยอดโอน"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>

                <button
                  onClick={handleVerify}
                  className="w-full flex items-center justify-center gap-2 bg-success/10 text-success border border-success/30 py-2.5 rounded-lg text-sm font-semibold hover:bg-success/15 transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" /> ยืนยันการชำระเงิน (Verify)
                </button>

                <div className="border-t pt-4">
                  {!showRejectForm ? (
                    <button
                      onClick={() => setShowRejectForm(true)}
                      className="w-full flex items-center justify-center gap-2 bg-destructive/10 text-destructive border border-destructive/30 py-2.5 rounded-lg text-sm font-semibold hover:bg-destructive/15 transition-colors cursor-pointer"
                    >
                      <XCircle className="w-4 h-4" /> ปฏิเสธการชำระเงิน
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-foreground block">
                        เหตุผลการปฏิเสธ (บังคับ)
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="เช่น ยอดเงินไม่ตรง / สลิปหมดอายุ / Reference Code ไม่ถูกต้อง"
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowRejectForm(false)}
                          className="flex-1 py-2 rounded-lg border text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                        <button
                          onClick={handleReject}
                          disabled={!rejectReason.trim()}
                          className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
                        >
                          ยืนยันการปฏิเสธ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Audit trail */}
            {(currentSub.approved_by || currentSub.approved_at) && (
              <div className="stat-card space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-accent" />
                  <h2 className="section-title text-base">Audit Trail</h2>
                </div>
                <dl className="space-y-2 text-sm">
                  {currentSub.approved_by && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">ดำเนินการโดย</dt>
                      <dd className="text-foreground font-medium">{currentSub.approved_by}</dd>
                    </div>
                  )}
                  {currentSub.approved_at && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">เวลาดำเนินการ</dt>
                      <dd className="text-foreground tabular-nums text-xs">{formatDateTime(currentSub.approved_at)}</dd>
                    </div>
                  )}
                  {currentSub.admin_note && (
                    <div>
                      <dt className="text-muted-foreground mb-1">หมายเหตุ</dt>
                      <dd className="text-foreground bg-muted rounded-lg px-3 py-2 text-xs leading-relaxed">
                        {currentSub.admin_note}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Currently pending hint */}
            {isPending && !successMsg && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-lg px-4 py-3">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>รายการนี้รอการตรวจสอบ กรุณาตรวจสอบยอดและหลักฐานก่อนดำเนินการ</span>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Valora Admin Backoffice — Approved by: {adminEmail}
        </p>
      </div>
    </div>
  );
}
