import { Loader2, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlanningAssumptions, PlanningAssumptionsPayload } from "@/services/storeAdminApi";

type Props = {
  assumptions: PlanningAssumptions | null;
  loading?: boolean;
  onSave: (payload: PlanningAssumptionsPayload) => Promise<void>;
};

type FormState = {
  expected_cups_per_month: string;
  operating_days_per_month: string;
  target_profit_monthly: string;
};

function toForm(a: PlanningAssumptions | null): FormState {
  return {
    expected_cups_per_month: a ? String(a.expected_cups_per_month) : "",
    operating_days_per_month: a ? String(a.operating_days_per_month) : "",
    target_profit_monthly: a ? String(a.target_profit_monthly) : "",
  };
}

/**
 * Section C — สมมติฐานการวางแผนกำไร.
 * overhead_allocation_method is intentionally NOT shown (always "per_cup").
 */
export default function PlanningAssumptionsCard({ assumptions, loading, onSave }: Props) {
  const [form, setForm] = useState<FormState>(() => toForm(assumptions));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Re-sync local form whenever fresh assumptions arrive from the server.
  useEffect(() => {
    setForm(toForm(assumptions));
  }, [assumptions]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    const expected = Number(form.expected_cups_per_month);
    const days = Number(form.operating_days_per_month);
    const target = Number(form.target_profit_monthly);

    if (!Number.isFinite(expected) || expected <= 0) {
      setError("กรุณาระบุจำนวนแก้วต่อเดือนให้มากกว่า 0");
      return;
    }
    if (!Number.isFinite(days) || days <= 0 || days > 31) {
      setError("กรุณาระบุจำนวนวันเปิดร้านต่อเดือนให้ถูกต้อง (1–31)");
      return;
    }
    if (!Number.isFinite(target) || target < 0) {
      setError("เป้ากำไรต่อเดือนต้องไม่ติดลบ");
      return;
    }

    setError("");
    setSaving(true);
    try {
      await onSave({
        expected_cups_per_month: Math.round(expected),
        operating_days_per_month: Math.round(days),
        target_profit_monthly: target,
      });
    } catch {
      setError("ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stat-card space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-accent/10 p-2 text-accent">
          <SlidersHorizontal className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">2. สมมติฐานการวางแผน</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            ระบบจะใช้จำนวนแก้วต่อเดือนเพื่อเฉลี่ยต้นทุนแฝงต่อแก้ว
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          กำลังโหลดข้อมูลต้นทุนแฝง...
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="คาดว่าจะขายกี่แก้วต่อเดือน"
              suffix="แก้ว"
              value={form.expected_cups_per_month}
              onChange={set("expected_cups_per_month")}
              min={1}
              step={10}
            />
            <Field
              label="เปิดร้านกี่วันต่อเดือน"
              suffix="วัน"
              value={form.operating_days_per_month}
              onChange={set("operating_days_per_month")}
              min={1}
              max={31}
              step={1}
            />
            <Field
              label="เป้ากำไรต่อเดือน"
              suffix="บาท"
              value={form.target_profit_monthly}
              onChange={set("target_profit_monthly")}
              min={0}
              step={500}
            />
          </div>

          <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            ตัวอย่าง: ค่าใช้จ่ายประจำ 4,500 บาท / 300 แก้ว = 15 บาทต่อแก้ว
          </p>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          <div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              บันทึกสมมติฐาน
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  suffix,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <label className="form-label mb-1.5 block">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
          className="w-full rounded-lg border bg-background px-3 py-2 text-right text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}
