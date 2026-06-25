import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Step, StepDescriptor } from "@/features/staff/kiosk";

type KioskStepIndicatorProps = {
  steps: StepDescriptor[];
  activeStep: Step;
};

/**
 * Horizontal, numbered progress indicator for the kiosk wizard.
 * Steps before the active one render as completed (check), the active one is
 * highlighted, and later steps are muted. Purely presentational.
 */
export default function KioskStepIndicator({ steps, activeStep }: KioskStepIndicatorProps) {
  const activeIndex = steps.findIndex((step) => step.id === activeStep);

  return (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label="ขั้นตอนการสร้างออเดอร์">
      {steps.map((step, index) => {
        const isComplete = index < activeIndex;
        const isActive = index === activeIndex;
        return (
          <li key={step.id} className="flex flex-1 items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                  isActive && "border-primary bg-primary text-primary-foreground",
                  isComplete && "border-emerald-500 bg-emerald-500 text-white",
                  !isActive && !isComplete && "border-muted-foreground/30 bg-muted text-muted-foreground",
                )}
                aria-current={isActive ? "step" : undefined}
              >
                {isComplete ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap text-sm font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <span
                className={cn(
                  "hidden h-px flex-1 sm:block",
                  index < activeIndex ? "bg-emerald-500" : "bg-border",
                )}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
