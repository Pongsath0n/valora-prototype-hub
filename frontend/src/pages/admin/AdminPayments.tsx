import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { useAdminGuard } from "@/lib/guards";
import { getApprovalRows } from "@/services/adminService";
import {
  formatCycleLabel,
  formatDateTime,
  formatPlanLabel,
  formatSubmissionStatus,
  formatTHB,
  submissionStatusColor,
} from "@/lib/format";
import { ExternalLink, Filter, Loader2 } from "lucide-react";
import type { SubmissionStatus } from "@/features/billing/types";
import { FormSelect } from "@/components/ui/form-select";

export default function AdminPaymentsPage() {
  const { checking } = useAdminGuard();
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | "ALL">("ALL");
  const [planFilter, setPlanFilter] = useState<string>("ALL");

  const rows = useMemo(
    () => getApprovalRows({ status: statusFilter, plan: planFilter }),
    [statusFilter, planFilter],
  );

  if (checking) {
    return (
      <AdminLayout title="Payment Queue" subtitle="ตรวจสอบสลิปและอนุมัติการชำระเงิน">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          กำลังตรวจสอบสิทธิ์...
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Payment Queue"
      subtitle="ตรวจสอบสลิปและอนุมัติ/ปฏิเสธการชำระเงินจากลูกค้า"
    >
      <div className="stat-card">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-foreground">สถานะ:</label>
            <FormSelect
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as SubmissionStatus | "ALL")}
              options={[
                { value: "ALL", label: "ทั้งหมด" },
                { value: "PAYMENT_SUBMITTED", label: "รอตรวจสอบ" },
                { value: "VERIFIED", label: "ยืนยันแล้ว" },
                { value: "REJECTED", label: "ปฏิเสธ" },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-foreground">แผน:</label>
            <FormSelect
              value={planFilter}
              onValueChange={(value) => setPlanFilter(value)}
              options={[
                { value: "ALL", label: "ทุกแผน" },
                { value: "starter", label: "Starter" },
                { value: "pro", label: "Pro" },
              ]}
            />
          </div>
          <span className="text-sm text-muted-foreground ml-auto">
            พบ {rows.length} รายการ
          </span>
        </div>
      </div>

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
                <tr
                  key={submission.submission_id}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-3 text-foreground tabular-nums text-xs">
                    {formatDateTime(submission.paid_at)}
                  </td>
                  <td className="py-3 text-foreground font-medium text-xs">
                    {submission.user_email ?? "—"}
                  </td>
                  <td className="py-3 font-semibold">{formatPlanLabel(invoice.plan)}</td>
                  <td className="py-3 text-muted-foreground">
                    {formatCycleLabel(invoice.billing_cycle)}
                  </td>
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
                      to={`/store-admin/payments/${submission.submission_id}`}
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
    </AdminLayout>
  );
}
