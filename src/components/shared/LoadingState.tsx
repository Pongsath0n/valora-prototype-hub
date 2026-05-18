import { Loader2 } from "lucide-react";

export default function LoadingState({ label = "กำลังโหลดข้อมูล..." }: { label?: string }) {
  return (
    <div className="rounded-xl border p-8 text-center bg-card">
      <Loader2 className="mx-auto h-7 w-7 animate-spin text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
