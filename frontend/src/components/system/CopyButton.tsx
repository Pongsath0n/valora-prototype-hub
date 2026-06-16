import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small copy-to-clipboard button used for full reference IDs.
 * Fails silently if the clipboard API is unavailable (e.g. older browsers).
 */
export default function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator?.clipboard?.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — ignore, do not surface a technical error.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label ?? "คัดลอกรหัสอ้างอิงแบบเต็ม"}
      aria-label={label ?? `คัดลอก ${value}`}
      className={cn(
        "inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
