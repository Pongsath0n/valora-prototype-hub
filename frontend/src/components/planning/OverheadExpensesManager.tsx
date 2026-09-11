import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  OVERHEAD_CATEGORIES,
  OVERHEAD_PERIODS,
  type OverheadCategory,
  type OverheadExpense,
  type OverheadExpensePayload,
  type OverheadPeriod,
} from "@/services/storeAdminApi";
import {
  formatBaht,
  OVERHEAD_CATEGORY_LABELS,
  OVERHEAD_PERIOD_LABELS,
  overheadCategoryLabel,
  overheadPeriodLabel,
} from "./overheadLabels";
import { FormSelect } from "@/components/ui/form-select";

type Props = {
  expenses: OverheadExpense[];
  loading?: boolean;
  refreshing?: boolean;
  onRefresh: () => void;
  onCreate: (payload: OverheadExpensePayload) => Promise<void>;
  onUpdate: (id: string, payload: Partial<OverheadExpensePayload>) => Promise<void>;
  onDeactivate: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

type FormState = {
  name: string;
  category: OverheadCategory;
  amount: string;
  period: OverheadPeriod;
  is_active: boolean;
  note: string;
};

type StatusFilter = "all" | "active" | "inactive";

const emptyForm: FormState = {
  name: "",
  category: "rent",
  amount: "",
  period: "monthly",
  is_active: true,
  note: "",
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "active", label: "ใช้งานอยู่" },
  { key: "inactive", label: "ปิดใช้งาน" },
];

/** Section 3 — ต้นทุนแฝง / ค่าใช้จ่ายประจำ (list + filters + add/edit + deactivate + true delete). */
export default function OverheadExpensesManager({
  expenses,
  loading,
  refreshing,
  onRefresh,
  onCreate,
  onUpdate,
  onDeactivate,
  onDelete,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OverheadExpense | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deleting, setDeleting] = useState<OverheadExpense | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const visibleExpenses = useMemo(() => {
    if (statusFilter === "active") return expenses.filter((e) => e.is_active !== false);
    if (statusFilter === "inactive") return expenses.filter((e) => e.is_active === false);
    return expenses;
  }, [expenses, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setDialogOpen(true);
  };

  const openEdit = (row: OverheadExpense) => {
    setEditing(row);
    setForm({
      name: row.name ?? "",
      category: (row.category as OverheadCategory) ?? "other",
      amount: String(row.amount ?? ""),
      period: (row.period as OverheadPeriod) ?? "monthly",
      is_active: row.is_active !== false,
      note: row.note ?? "",
    });
    setFormError("");
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const name = form.name.trim();
    const amount = Number(form.amount);
    if (!name) {
      setFormError("กรุณากรอกชื่อรายการ");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setFormError("กรุณากรอกจำนวนเงินให้ถูกต้อง");
      return;
    }

    const payload: OverheadExpensePayload = {
      name,
      category: form.category,
      amount,
      period: form.period,
      is_active: form.is_active,
      note: form.note.trim() || null,
    };

    setSubmitting(true);
    setFormError("");
    try {
      if (editing) {
        await onUpdate(editing.id, payload);
      } else {
        await onCreate(payload);
      }
      setDialogOpen(false);
    } catch {
      setFormError("ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    setBusyId(id);
    try {
      await onDeactivate(id);
      setConfirmingId(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleReactivate = async (id: string) => {
    setBusyId(id);
    try {
      await onUpdate(id, { is_active: true });
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await onDelete(deleting.id);
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="stat-card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">3. ต้นทุนแฝง / ค่าใช้จ่ายประจำ</h2>
          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
            เพิ่มค่าเช่า ค่าน้ำ ค่าไฟ หรือค่าใช้จ่ายประจำ เพื่อให้ระบบคำนวณกำไรหลังต้นทุนแฝงได้แม่นขึ้น
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            รีเฟรชข้อมูล
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            เพิ่มรายการ
          </button>
        </div>
      </div>

      <div className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/30 p-0.5 text-xs">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              statusFilter === f.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          กำลังโหลดข้อมูลต้นทุนแฝง...
        </div>
      ) : expenses.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          ยังไม่มีรายการต้นทุนแฝง
        </div>
      ) : visibleExpenses.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          ไม่มีรายการในตัวกรองนี้
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2">รายการ</th>
                <th className="py-2 pr-2">หมวด</th>
                <th className="py-2 pr-2 text-right">จำนวนเงิน</th>
                <th className="py-2 pr-2">รอบค่าใช้จ่าย</th>
                <th className="py-2 pr-2">สถานะ</th>
                <th className="py-2 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {visibleExpenses.map((row) => {
                const inactive = row.is_active === false;
                const isConfirming = confirmingId === row.id;
                const isBusy = busyId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={`border-t border-muted/80 align-top ${inactive ? "opacity-60" : ""}`}
                  >
                    <td className="py-2.5 pr-2">
                      <div className="font-medium text-foreground">{row.name}</div>
                      {row.note && <div className="text-xs text-muted-foreground">{row.note}</div>}
                    </td>
                    <td className="py-2.5 pr-2 text-foreground">{overheadCategoryLabel(row.category)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-foreground">
                      {formatBaht(row.amount)}
                    </td>
                    <td className="py-2.5 pr-2 text-foreground">{overheadPeriodLabel(row.period)}</td>
                    <td className="py-2.5 pr-2">
                      {inactive ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          ปิดใช้งาน
                        </span>
                      ) : (
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                          ใช้งาน
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {isConfirming ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-muted-foreground">ยืนยันปิดใช้งาน?</span>
                          <button
                            type="button"
                            onClick={() => handleDeactivate(row.id)}
                            disabled={isBusy}
                            className="text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-60"
                          >
                            {isBusy ? "กำลังปิด..." : "ยืนยัน"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(null)}
                            disabled={isBusy}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          {inactive ? (
                            <button
                              type="button"
                              onClick={() => handleReactivate(row.id)}
                              disabled={isBusy}
                              className="text-xs font-medium text-accent hover:text-accent/80 disabled:opacity-60"
                            >
                              {isBusy ? "กำลังเปิด..." : "เปิดใช้งาน"}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(row)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
                              >
                                <Pencil className="h-3.5 w-3.5" /> แก้ไข
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingId(row.id)}
                                className="text-xs font-medium text-muted-foreground hover:text-destructive"
                              >
                                ปิดใช้งาน
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleting(row)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> ลบ
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !submitting && setDialogOpen(open)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขรายการต้นทุนแฝง" : "เพิ่มรายการต้นทุนแฝง"}</DialogTitle>
            <DialogDescription>
              บันทึกค่าใช้จ่ายประจำ เช่น ค่าเช่า ค่าน้ำ ค่าไฟ เพื่อใช้คำนวณกำไรหลังรวมต้นทุนแฝง
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div>
              <label className="form-label mb-1.5 block">รายการ</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="เช่น ค่าเช่าร้าน"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label mb-1.5 block">หมวด</label>
                <FormSelect
                  value={form.category}
                  onValueChange={(value) => setForm((p) => ({ ...p, category: value as OverheadCategory }))}
                  options={OVERHEAD_CATEGORIES.map((c) => ({ value: c, label: OVERHEAD_CATEGORY_LABELS[c] }))}
                />
              </div>

              <div>
                <label className="form-label mb-1.5 block">รอบค่าใช้จ่าย</label>
                <FormSelect
                  value={form.period}
                  onValueChange={(value) => setForm((p) => ({ ...p, period: value as OverheadPeriod }))}
                  options={OVERHEAD_PERIODS.map((p) => ({ value: p, label: OVERHEAD_PERIOD_LABELS[p] }))}
                />
              </div>
            </div>

            <div>
              <label className="form-label mb-1.5 block">จำนวนเงิน</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={50}
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-right text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">บาท</span>
              </div>
            </div>

            <div>
              <label className="form-label mb-1.5 block">หมายเหตุ</label>
              <textarea
                value={form.note}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                rows={2}
                maxLength={200}
                placeholder="ไม่บังคับ"
                className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              เปิดใช้งาน (นำมาคำนวณต้นทุนแฝง)
            </label>

            {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
          </div>

          <DialogFooter className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              บันทึก
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* True hard-delete confirm dialog */}
      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !deleteBusy && !open && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ยืนยันการลบรายการต้นทุนแฝง</DialogTitle>
            <DialogDescription>
              เมื่อลบแล้ว รายการนี้จะหายจากระบบ และจะไม่ถูกนำไปใช้ในการวางแผนอีก
            </DialogDescription>
          </DialogHeader>

          {deleting && (
            <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground">
              {deleting.name} • {overheadCategoryLabel(deleting.category)} • {formatBaht(deleting.amount)}
            </p>
          )}

          <DialogFooter className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              disabled={deleteBusy}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleteBusy}
              className="flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {deleteBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              ลบถาวร
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
