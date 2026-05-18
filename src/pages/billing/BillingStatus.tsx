import AppLayout from "@/components/AppLayout";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  userPlanService,
  invoiceService,
  submissionService,
  PLAN_PRICES,
} from "@/services/billingService";
import {
  formatTHB,
  formatDateTime,
  formatPlanLabel,
  formatPlanStatus,
  formatSubmissionStatus,
  planStatusColor,
  submissionStatusColor,
} from "@/lib/format";
import { calcAccess } from "@/features/billing/calcAccess";
import { ArrowRight, ShieldCheck, Receipt, RefreshCw } from "lucide-react";

export default function BillingStatusPage() {
  const userPlan = useMemo(() => userPlanService.get(), []);
  const access = useMemo(() => calcAccess(userPlan.current_plan), [userPlan]);
  const latestInvoice = useMemo(
    () => invoiceService.getLatest(userPlan.user_id),
    [userPlan]
  );
  const latestSubmission = useMemo(
    () => (latestInvoice ? submissionService.getByInvoice(latestInvoice.invoice_id) : null),
    [latestInvoice]
  );

  const planPrice = PLAN_PRICES[userPlan.current_plan];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* ── Page Header ─────────────────────────────── */}
        <div className="page-header">
          <div>
            <h1 className="page-title">แพ็กเกจและการชำระเงิน</h1>
            <p className="page-subtitle">ดูสถานะแพ็กเกจและประวัติการชำระเงินของคุณ</p>
          </div>
          <Link
            to="/pricing"
            className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> เปลี่ยนแพ็กเกจ
          </Link>
        </div>

        {/* Current Plan Status */}
        <div className="stat-card">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground font-medium">แพ็กเกจปัจจุบัน</p>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-foreground">
                  {formatPlanLabel(userPlan.current_plan)}
                </span>
                <span className={`status-badge ${planStatusColor(userPlan.status)}`}>
                  {formatPlanStatus(userPlan.status)}
                </span>
              </div>
              {userPlan.current_plan !== "free" && (
                <p className="text-sm text-muted-foreground">
                  ซื้อขาด — {formatTHB(planPrice)}
                </p>
              )}
            </div>

            <div className="text-right space-y-1">
              <p className="text-sm text-muted-foreground">ไม่มีวันหมดอายุ</p>
              <p className="text-xs text-success font-semibold">ใช้งานได้ตลอดไป</p>
            </div>
          </div>

          {/* Feature summary */}
          <div className="mt-5 pt-5 border-t grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="metric-label">เมนูสูงสุด</p>
              <p className="font-bold text-foreground mt-1">
                {access.maxMenuItems === Infinity ? "ไม่จำกัด" : `${access.maxMenuItems} รายการ`}
              </p>
            </div>
            <div>
              <p className="metric-label">สถานการณ์</p>
              <p className="font-bold text-foreground mt-1">
                {access.maxScenarios === Infinity ? "ไม่จำกัด" : `${access.maxScenarios} สถานการณ์`}
              </p>
            </div>
            <div>
              <p className="metric-label">ส่งออก PDF/PNG</p>
              <p className={`font-bold mt-1 ${access.canExportSummary ? "text-success" : "text-muted-foreground"}`}>
                {access.canExportSummary ? "รวมอยู่ในแผน" : "ไม่รวม"}
              </p>
            </div>
            <div>
              <p className="metric-label">แชร์ลิงก์</p>
              <p className={`font-bold mt-1 ${access.canShareLink ? "text-success" : "text-muted-foreground"}`}>
                {access.canShareLink ? "รวมอยู่ในแผน" : "ไม่รวม"}
              </p>
            </div>
          </div>

          {userPlan.current_plan === "free" && (
            <div className="mt-5 pt-5 border-t">
              <Link
                to="/pricing"
                className="flex items-center justify-between bg-accent/10 border border-accent/20 rounded-lg px-4 py-3 hover:bg-accent/15 transition-colors group"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">ซื้อแพ็กเกจ Starter</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    เปิดใช้งานเมนู 30 รายการ + ส่งออก PDF/PNG เพียง {formatTHB(590)} ครั้งเดียว
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-accent group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          )}
        </div>

        {/* Latest Invoice */}
        {latestInvoice && (
          <div className="stat-card space-y-4">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-muted-foreground" />
              <h2 className="section-title text-base">ใบแจ้งหนี้ล่าสุด</h2>
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="metric-label">Invoice ID</dt>
                <dd className="font-mono text-foreground text-xs mt-1">{latestInvoice.invoice_id}</dd>
              </div>
              <div>
                <dt className="metric-label">แพ็กเกจ</dt>
                <dd className="font-semibold text-foreground mt-1">{formatPlanLabel(latestInvoice.plan)}</dd>
              </div>
              <div>
                <dt className="metric-label">ยอดชำระ</dt>
                <dd className="font-bold text-foreground tabular-nums mt-1">
                  {formatTHB(latestInvoice.amount)}
                  <span className="text-xs text-muted-foreground font-normal ml-1">+ VAT 7%</span>
                </dd>
              </div>
              <div>
                <dt className="metric-label">Reference Code</dt>
                <dd className="font-mono text-foreground text-xs mt-1">{latestInvoice.reference_code}</dd>
              </div>
              <div>
                <dt className="metric-label">วันที่สร้าง</dt>
                <dd className="text-foreground text-xs tabular-nums mt-1">{formatDateTime(latestInvoice.created_at)}</dd>
              </div>
            </dl>

            {/* Submission status */}
            {latestSubmission && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">สถานะการชำระเงิน</p>
                  <span className={`status-badge ${submissionStatusColor(latestSubmission.status)}`}>
                    {formatSubmissionStatus(latestSubmission.status)}
                  </span>
                </div>
                {latestSubmission.status === "PAYMENT_SUBMITTED" && (
                  <p className="text-xs text-muted-foreground mt-2">
                    ทีม Valora กำลังตรวจสอบหลักฐานของคุณ — โดยปกติใช้เวลาไม่เกิน 1 วันทำการ
                  </p>
                )}
                {latestSubmission.status === "REJECTED" && latestSubmission.admin_note && (
                  <div className="mt-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-xs text-destructive">
                    เหตุผล: {latestSubmission.admin_note}
                  </div>
                )}
                {latestSubmission.status === "REJECTED" && (
                  <Link
                    to={`/checkout?invoice=${latestInvoice.invoice_id}`}
                    className="inline-flex items-center gap-1.5 mt-3 text-sm text-accent hover:underline"
                  >
                    แจ้งชำระเงินอีกครั้ง <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            )}

            {!latestSubmission && latestInvoice.status === "UNPAID" && (
              <div className="pt-4 border-t">
                <Link
                  to={`/checkout?invoice=${latestInvoice.invoice_id}`}
                  className="flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  แจ้งชำระเงิน <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Trust note */}
        <div className="flex items-start gap-3 bg-muted/50 border rounded-lg px-4 py-3">
          <ShieldCheck className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            ข้อมูลการสมัครและการชำระเงินถูกจัดเก็บอย่างปลอดภัย Valora ไม่เก็บข้อมูลบัตรเครดิตหรือข้อมูลทางการเงินใดๆ
            การชำระเงินดำเนินการผ่านการโอนธนาคารและตรวจสอบโดยทีมงานก่อน activate
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
