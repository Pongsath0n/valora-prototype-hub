import { Link } from "react-router-dom";
import { X, TrendingUp, AlertCircle } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
export type UpgradeTrigger =
  | "menu_limit"
  | "scenario_limit"
  | "export_required"
  | "promo_advanced"
  | "delivery_advanced"
  | "share_link";

interface UsageBar {
  label: string;
  used: number;
  limit: number;
  unit: string;
}

interface UpgradeModalProps {
  trigger: UpgradeTrigger;
  onClose: () => void;
}

// ─── Trigger configurations ─────────────────────────────────────────────────
type TriggerConfig = {
  title: string;
  description: string;
  usage: UsageBar[];
  reason: string;
  suggestedPlan: "starter" | "pro";
};

const TRIGGER_CONFIG: Record<UpgradeTrigger, TriggerConfig> = {
  menu_limit: {
    title: "ถึงขีดจำกัดจำนวนเมนูของแผน Free",
    description:
      "แผน Free รองรับเมนูสูงสุด 10 รายการ หากต้องการเพิ่มเมนูเพื่อคำนวณต้นทุนและ BEP ได้ครบถ้วน กรุณาอัปเกรดแผน",
    usage: [{ label: "เมนูที่ใช้งาน", used: 10, limit: 10, unit: "รายการ" }],
    reason:
      "การมีเมนูครบถ้วนช่วยให้การคำนวณจุดคุ้มทุนและ Weighted Average Margin แม่นยำกว่าเมนูบางส่วน",
    suggestedPlan: "starter",
  },
  scenario_limit: {
    title: "ถึงขีดจำกัดจำนวนสถานการณ์ของแผน Free",
    description:
      "แผน Free รองรับการบันทึกสถานการณ์สูงสุด 3 สถานการณ์ หากต้องการทดสอบตัวแปรเพิ่มเติม กรุณาอัปเกรดแผน",
    usage: [{ label: "สถานการณ์ที่บันทึก", used: 3, limit: 3, unit: "สถานการณ์" }],
    reason:
      "การเปรียบเทียบหลายสถานการณ์ช่วยค้นหาส่วนผสมราคา-ต้นทุนที่เหมาะสมก่อนตัดสินใจปรับเมนู",
    suggestedPlan: "starter",
  },
  export_required: {
    title: "การส่งออก PDF/PNG ต้องการแผน Starter ขึ้นไป",
    description:
      "แผน Free ไม่รองรับการส่งออกรายงาน ฟีเจอร์นี้พร้อมใช้งานในแผน Starter (สรุป 1 หน้า) และแผน Pro (สรุป + รายงานเปรียบเทียบสถานการณ์)",
    usage: [],
    reason:
      "รายงาน PDF/PNG ช่วยนำเสนอข้อมูลต่อหุ้นส่วนหรือผู้ให้เงินทุนได้อย่างเป็นทางการและตรวจสอบได้",
    suggestedPlan: "starter",
  },
  promo_advanced: {
    title: "โปรโมชันประเภทนี้ต้องการแผน Pro",
    description:
      "การจำลองโปรโมชันแบบ ซื้อ 1 แถม 1 และคูปองมีเฉพาะในแผน Pro แผน Starter รองรับเฉพาะส่วนลด % เท่านั้น",
    usage: [],
    reason:
      "โปรโมชัน ซื้อ 1 แถม 1 มีผลต่อต้นทุนต่อหน่วยและ Contribution Margin แตกต่างจากส่วนลดตรง — ต้องคำนวณแยก",
    suggestedPlan: "pro",
  },
  delivery_advanced: {
    title: "การวิเคราะห์ราคาที่แนะนำต้องการแผน Pro",
    description:
      "การแนะนำราคาจัดส่งที่เหมาะสมและเปรียบเทียบกำไรระหว่างช่องทางมีเฉพาะในแผน Pro แผน Starter รองรับเฉพาะการหักค่า Fee %",
    usage: [],
    reason:
      "การวิเคราะห์กำไรสุทธิต่อออเดอร์ระหว่างแพลตฟอร์มช่วยตัดสินใจว่าช่องทางไหนคุ้มค่าที่สุดสำหรับร้านของคุณ",
    suggestedPlan: "pro",
  },
  share_link: {
    title: "การแชร์ลิงก์รายงานต้องการแผน Pro",
    description:
      "ฟีเจอร์แชร์ลิงก์รายงานแบบอ่านอย่างเดียวมีเฉพาะในแผน Pro เพื่อให้สามารถแชร์ข้อมูลกับหุ้นส่วนหรือที่ปรึกษาได้",
    usage: [],
    reason:
      "ลิงก์รายงานช่วยให้ผู้ที่ไม่มีบัญชี Valora สามารถดูข้อมูลได้โดยไม่ต้องส่งไฟล์",
    suggestedPlan: "pro",
  },
};

const PLAN_LABELS: Record<"starter" | "pro", { name: string; price: string }> = {
  starter: { name: "Starter", price: "฿590" },
  pro: { name: "Pro", price: "฿1,490" },
};

// ─── Component ──────────────────────────────────────────────────────────────
export default function UpgradeModal({ trigger, onClose }: UpgradeModalProps) {
  const cfg = TRIGGER_CONFIG[trigger];
  const plan = PLAN_LABELS[cfg.suggestedPlan];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <h2 className="text-base font-semibold text-foreground leading-snug">
              {cfg.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground flex-shrink-0 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {cfg.description}
          </p>

          {/* Usage bars */}
          {cfg.usage.length > 0 && (
            <div className="space-y-3">
              {cfg.usage.map((u, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span className="font-medium text-foreground">{u.label}</span>
                    <span className="tabular-nums font-medium text-foreground">
                      {u.used}/{u.limit} {u.unit}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-destructive"
                      style={{ width: `${(u.used / u.limit) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-destructive mt-1">ถึงขีดจำกัดแล้ว</p>
                </div>
              ))}
            </div>
          )}

          {/* Why this matters */}
          <div className="bg-accent/10 border border-accent/20 rounded-lg px-4 py-3">
            <div className="flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">
                  ทำไมฟีเจอร์นี้จึงมีความสำคัญ
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {cfg.reason}
                </p>
              </div>
            </div>
          </div>

          {/* Suggested plan */}
          <div className="border rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">แพ็กเกจ {plan.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                เปิดใช้งานฟีเจอร์นี้ได้ทันที
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-foreground tabular-nums">{plan.price}</p>
              <p className="text-xs text-muted-foreground">ครั้งเดียว + VAT 7%</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex flex-col gap-2">
          <Link
            to="/pricing"
            onClick={onClose}
            className="block text-center py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            ดูแพ็กเกจและซื้อ
          </Link>
          <button
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            ใช้แผน Free ต่อ
          </button>
          <p className="text-center text-xs text-muted-foreground">
            ชำระครั้งเดียว — ใช้งานได้ตลอดไป
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Convenience hook for triggering modal ──────────────────────────────────
// Usage: const { show, UpgradeModalElement } = useUpgradeModal()
//        Then: show("menu_limit")  and  {UpgradeModalElement}
import { useState as _useState } from "react";

export function useUpgradeModal() {
  const [trigger, setTrigger] = _useState<UpgradeTrigger | null>(null);
  const show = (t: UpgradeTrigger) => setTrigger(t);
  const hide = () => setTrigger(null);
  const UpgradeModalElement = trigger ? (
    <UpgradeModal trigger={trigger} onClose={hide} />
  ) : null;
  return { show, hide, UpgradeModalElement };
}
