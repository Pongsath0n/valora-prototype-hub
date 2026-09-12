import * as React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EMPTY_OPTION_VALUE, fromRadixValue, toRadixValue } from "@/components/ui/form-select-utils";

export type FormSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type FormSelectProps = {
  options: FormSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
  emptyMessage?: string;
};

/**
 * FormSelect — a thin wrapper around the shared Radix Select that provides
 * a simple API equivalent to native <select> for easy migration.
 *
 * UX contract:
 * - Dropdown content opens BELOW the trigger (side="bottom")
 * - Collision flipping is disabled (avoidCollisions={false})
 * - Content has bounded max-height with internal scrolling
 * - Portal rendering prevents clipping by parent containers
 *
 * Empty-value compatibility:
 * - Options with `value: ""` (e.g. "ไม่ระบุหมวดหมู่", "ทุกช่องทาง") are
 *   rendered using an internal sentinel so Radix never receives an empty
 *   SelectItem value.
 * - When the user selects such an option, `onValueChange` receives the
 *   original business value `""` — the sentinel never leaks.
 * - When `value` is `""` AND no option has `value: ""`, the placeholder
 *   is shown (placeholder-only empty state).
 */
export function FormSelect({
  options,
  value,
  onValueChange,
  placeholder = "เลือก...",
  disabled = false,
  className,
  id,
  ariaLabel,
  emptyMessage = "ไม่มีข้อมูลให้เลือก",
}: FormSelectProps) {
  const hasOptions = options.length > 0;

  // Determine whether any option explicitly uses "" as a real selectable
  // value (CASE B). If so, the empty string is a valid selection and the
  // trigger should display its label. If not, "" means "no selection"
  // and the placeholder should show (CASE A).
  const hasEmptyOption = options.some((opt) => opt.value === "");

  // Radix receives undefined when the business value is "" and there is
  // no explicit empty option — this shows the placeholder. When there IS
  // an explicit empty option, Radix receives the sentinel so the trigger
  // displays the option's label.
  const radixValue = value === "" && !hasEmptyOption ? undefined : toRadixValue(value);

  const handleValueChange = React.useCallback(
    (radixValue: string) => {
      onValueChange(fromRadixValue(radixValue));
    },
    [onValueChange],
  );

  return (
    <Select
      value={radixValue}
      onValueChange={handleValueChange}
      disabled={disabled || !hasOptions}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn("w-full", className)}
      >
        <SelectValue placeholder={hasOptions ? placeholder : emptyMessage} />
      </SelectTrigger>
      <SelectContent>
        {hasOptions ? (
          <SelectGroup>
            {options.map((option, index) => (
              <SelectItem
                key={option.value || `__empty_${index}`}
                value={toRadixValue(option.value)}
                disabled={option.disabled}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : (
          <div className="py-2 px-3 text-sm text-muted-foreground">{emptyMessage}</div>
        )}
      </SelectContent>
    </Select>
  );
}

export default FormSelect;
