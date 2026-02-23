import { AlertTriangle, XCircle, ArrowRight } from "lucide-react";

interface WarningAlertProps {
  type: "error" | "warning";
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function WarningAlert({
  type,
  title,
  description,
  action,
}: WarningAlertProps) {
  const isError = type === "error";

  return (
    <div
      className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${
        isError
          ? "bg-destructive/5 border-destructive/30"
          : "bg-warning/5 border-warning/30"
      }`}
    >
      {isError ? (
        <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-semibold ${
            isError ? "text-destructive" : "text-foreground"
          }`}
        >
          {title}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        {action && (
          <button
            onClick={action.onClick}
            className={`mt-2 inline-flex items-center gap-1 text-xs font-medium transition-colors ${
              isError
                ? "text-destructive hover:text-destructive/80"
                : "text-accent hover:text-accent/80"
            }`}
          >
            {action.label}
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
