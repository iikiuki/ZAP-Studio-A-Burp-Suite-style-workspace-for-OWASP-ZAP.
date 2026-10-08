import { cn } from "../lib/format";

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  className?: string;
  render: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onSelect?: (row: T) => void;
  selectedKey?: string;
  empty?: string;
  className?: string;
}

export function DataTable<T>({ columns, rows, rowKey, onSelect, selectedKey, empty, className }: Props<T>) {
  return (
    <div className={cn("h-full overflow-auto", className)}>
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-ink-800">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-2 py-1.5 text-left font-semibold text-slate-400 border-b border-ink-700"
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                {empty ?? "No data"}
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                onClick={() => onSelect?.(row)}
                className={cn(
                  "border-b border-ink-800/60 transition-colors",
                  onSelect && "cursor-pointer",
                  selectedKey === key ? "bg-brand-500/15" : "hover:bg-ink-800/60",
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn("grid-cell", col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
