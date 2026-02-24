import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAdminGuard, adminLogout } from "@/lib/guards";
import { getApprovalRows, type ApprovalFilter } from "@/services/adminService";
import {
  formatTHB,
  formatDateTime,
  formatPlanLabel,
  formatCycleLabel,
  formatSubmissionStatus,
  submissionStatusColor,
} from "@/lib/format";
import LogoBrand from "@/components/LogoBrand";
import { LogOut, Filter, ExternalLink, Loader2 } from "lucide-react";
import type { SubmissionStatus } from "@/features/billing/types";

export default function ApprovalsListPage() {
  const { checking } = useAdminGuard();
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | "ALL">("ALL");
  const [planFilter, setPlanFilter] = useState<string>("ALL");

  const rows = useMemo(
    () => getApprovalRows({ status: statusFilter, plan: planFilter }),
    [statusFilter, planFilter]
  );

  const handleLogout = async () => {
    await adminLogout();
    navigate("/admin/login");
  };

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoBrand size="sm" iconOnly />
            <span className="font-bold text-foreground">Valora Admin</span>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              Backoffice
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> ออกจากระบบ
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* ── Page Header ─────────────────────────────── */}
        <div className="page-header">
          <div>
            <h1 className="page-title">รายการแจ้งชำระเงิน</h1>
            <p className="page-subtitle">ตรวจสอบและอนุมัติการชำระเงินจากผู้ใช้</p>
          </div>
        </div>

        {/* Filters */}
        <div className="stat-card">
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-foreground">สถานะ:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as SubmissionStatus | "ALL")}
                className="px-3 py-1.5 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="ALL">ทั้งหมด</option>
                <option value="PAYMENT_SUBMITTED">รอตรวจสอบ</option>
                <option value="VERIFIED">ยืนยันแล้ว</option>
                <option value="REJECTED">ปฏิเสธ</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-foreground">แผน:</label>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="ALL">ทุกแผน</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <span className="text-sm text-muted-foreground ml-auto">
              พบ {rows.length} รายการ
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="stat-card overflow-x-auto">
          {rows.length === 0 ? (
            <div className="empty-state">
              <Filter className="empty-state-icon" />
              <p className="empty-state-title">ไม่พบรายการ</p>
              <p className="empty-state-desc">ไม่พบรายการที่ตรงกับเงื่อนไขที่เลือก</p>
            </div>
          ) : (
            <table className="data-table min-w-[800px]">
              <thead>
                <tr>
                  <th>วันที่แจ้ง</th>
                  <th>ผู้ใช้ (email)</th>
                  <th>แผน</th>
                  <th>รอบ</th>
                  <th className="text-right">ยอด (THB)</th>
                  <th>Ref Code</th>
                  <th>สถานะ</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ submission, invoice }) => (
                  <tr key={submission.submission_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-3 text-foreground tabular-nums text-xs">
                      {formatDateTime(submission.paid_at)}
                    </td>
                    <td className="py-3 text-foreground font-medium text-xs">
                      {submission.user_email ?? "—"}
                    </td>
                    <td className="py-3 font-semibold">{formatPlanLabel(invoice.plan)}</td>
                    <td className="py-3 text-muted-foreground">{formatCycleLabel(invoice.billing_cycle)}</td>
                    <td className="py-3 text-right tabular-nums font-medium">
                      {formatTHB(submission.paid_amount)}
                    </td>
                    <td className="py-3 font-mono text-xs text-muted-foreground">
                      {invoice.reference_code}
                    </td>
                    <td className="py-3">
                      <span className={`status-badge ${submissionStatusColor(submission.status)}`}>
                        {formatSubmissionStatus(submission.status)}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        to={`/admin/approvals/${submission.submission_id}`}
                        className="flex items-center gap-1 text-xs text-accent hover:underline justify-end"
                      >
                        ดูรายละเอียด <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Valora Admin Backoffice — ข้อมูลจาก Supabase
        </p>
      </div>
    </div>
  );
}
