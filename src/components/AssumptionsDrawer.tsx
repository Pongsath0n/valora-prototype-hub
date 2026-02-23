import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen, Info } from "lucide-react";

interface FormulaItem {
  label: string;
  formula: string;
}

interface AssumptionItem {
  text: string;
}

interface AssumptionsDrawerProps {
  title?: string;
  inputSources: string[];
  formulas: FormulaItem[];
  assumptions: AssumptionItem[];
  roundingRule?: string;
}

export default function AssumptionsDrawer({
  title = "วิธีคำนวณและสมมติฐาน",
  inputSources,
  formulas,
  assumptions,
  roundingRule = "ปัดเศษทศนิยม 1 ตำแหน่ง",
}: AssumptionsDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="stat-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
          <span className="section-title text-base">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t space-y-5 animate-fade-in">
          {/* Input Sources */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">
              แหล่งข้อมูลที่ใช้
            </h4>
            <ul className="space-y-1">
              {inputSources.map((src, i) => (
                <li
                  key={i}
                  className="text-sm text-muted-foreground flex items-start gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                  {src}
                </li>
              ))}
            </ul>
          </div>

          {/* Formulas */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">
              สูตรคำนวณ
            </h4>
            <div className="space-y-2">
              {formulas.map((f, i) => (
                <div key={i} className="bg-muted rounded-lg px-3 py-2">
                  <p className="text-sm font-medium text-foreground">
                    {f.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {f.formula}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Assumptions */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">
              สมมติฐาน
            </h4>
            <ul className="space-y-1">
              {assumptions.map((a, i) => (
                <li
                  key={i}
                  className="text-sm text-muted-foreground flex items-start gap-2"
                >
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {a.text}
                </li>
              ))}
            </ul>
          </div>

          {/* Rounding */}
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              กฎการปัดเศษ: {roundingRule}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
