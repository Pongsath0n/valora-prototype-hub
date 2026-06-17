import { useRef, type ChangeEvent } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

type FileUploadProps = {
  onFileSelect: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
  file?: File | null;
  label?: string;
  description?: string;
  error?: string;
};

export function FileUploadField({ onFileSelect, accept, disabled, file, label, description, error }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0];
    onFileSelect(next ?? null);
  };

  return (
    <div className="space-y-2">
      {label ? <p className="text-sm font-medium text-foreground">{label}</p> : null}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className={cn(
          "w-full rounded-lg border border-dashed border-muted-foreground/50 bg-muted/30 px-4 py-6 text-center",
          "hover:border-primary hover:text-primary transition focus:outline-none focus:ring-2 focus:ring-primary/30",
          disabled && "opacity-50 pointer-events-none",
        )}
      >
        <UploadCloud className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">
          {file ? file.name : "เลือกหรือลากไฟล์มาวาง"}
        </p>
        {description ? <p className="text-xs text-muted-foreground mt-1">{description}</p> : null}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleSelect}
        disabled={disabled}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
