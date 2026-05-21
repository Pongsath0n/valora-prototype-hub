import type { ReactNode } from "react";

export type Column<T> = { key: keyof T | string; header: string; render?: (row: T) => ReactNode; className?: string };

export default function DataTable<T extends Record<string, unknown>>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {columns.map((col) => (
              <th key={String(col.key)} className={`px-3 py-2 text-left font-medium ${col.className ?? ""}`}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-t">
              {columns.map((col) => (
                <td key={String(col.key)} className={`px-3 py-2 ${col.className ?? ""}`}>
                  {col.render ? col.render(row) : String(row[col.key as keyof T] ?? "-")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
