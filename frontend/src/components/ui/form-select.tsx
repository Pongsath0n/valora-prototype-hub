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

  return (
    <Select
      value={value || undefined}
      onValueChange={onValueChange}
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
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
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
