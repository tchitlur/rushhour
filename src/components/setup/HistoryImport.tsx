"use client";
// "Import past orders" — a CSV export from Square, Toast or the DoorDash Merchant Portal is parsed in the
// browser (nothing is uploaded) into a HistorySummary that the setup form stores with the restaurant.
import { useRef, useState } from "react";
import { parseOrdersCsv, calibrationScale, type HistorySummary } from "@/lib/csv";

export interface HistoryImportProps {
  /** current summary (controlled by the parent; null = nothing imported yet) */
  summary: HistorySummary | null;
  onImported: (summary: HistorySummary) => void;
  /** removes the stored history; when omitted the "Remove" button is hidden */
  onClear?: () => void;
  /** template baseline orders per night; when given, the calibration line shows the multiplier */
  baselineOrdersPerNight?: number;
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export default function HistoryImport({ summary, onImported, onClear, baselineOrdersPerNight }: HistoryImportProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [columns, setColumns] = useState<string | null>(null);

  const readFile = async (file: File) => {
    setReading(true); setError(null);
    try {
      const text = await file.text();
      const r = parseOrdersCsv(text);
      if (!r.summary) { setError(r.error ?? "Couldn't read that file."); setColumns(null); }
      else {
        setFileName(file.name);
        const detected = Object.entries(r.columns).map(([role, h]) => `${role === "orderId" ? "order" : role} ← ${h}`).join(" · ");
        setColumns(detected || null);
        onImported(r.summary);
      }
    } catch {
      setError("Couldn't read that file.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const scale = summary && baselineOrdersPerNight && baselineOrdersPerNight > 0 ? calibrationScale(summary, baselineOrdersPerNight) : null;

  return (
    <div className="flex flex-col gap-2 text-[12px]">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="sub">CSV export from Square, Toast or the DoorDash Merchant Portal. Parsed in your browser; nothing is uploaded.</span>
        <a className="sub underline underline-offset-2 whitespace-nowrap" href="/sample-orders.csv" download="sample-orders.csv">Download sample CSV</a>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); }} />
        <button type="button" className="btn h-8" onClick={() => fileRef.current?.click()} disabled={reading}>{reading ? "Reading…" : summary ? "Choose another CSV…" : "Choose CSV…"}</button>
        {fileName && summary && <span className="sub truncate max-w-[220px]" title={fileName}>{fileName}</span>}
        {summary && onClear && <button type="button" className="btn btn-ghost h-8 text-xs" onClick={() => { setFileName(null); setColumns(null); setError(null); onClear(); }}>Remove</button>}
      </div>

      {error && <div className="text-bad">{error} Headers we look for: date/time/created, item/name/product, qty, total/amount, channel/source.</div>}

      {summary && (
        <div className="border border-line rounded p-2 flex flex-col gap-2 bg-bg-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1">
            <Stat label="Orders found" value={summary.orders.toLocaleString("en-US")} />
            <Stat label="Date range" value={`${fmtDate(summary.from)} – ${fmtDate(summary.to)}`} small />
            <Stat label="Avg orders / day" value={summary.avgPerDay.toFixed(1)} />
            <Stat label="Avg on Fridays" value={summary.avgFriday > 0 ? summary.avgFriday.toFixed(1) : "no Fridays"} />
          </div>
          {summary.topItems.length > 0 && (
            <div>
              <div className="sub mb-0.5">Top items</div>
              <ol className="flex flex-col gap-0.5">
                {summary.topItems.map((t, i) => (
                  <li key={t.name} className="flex items-baseline gap-2">
                    <span className="num text-fg-3 w-3 text-right">{i + 1}</span>
                    <span className="truncate flex-1" title={t.name}>{t.name}</span>
                    <span className="num text-fg-2">{t.count.toLocaleString("en-US")}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <span className="font-medium">
              {scale != null
                ? <>Calibrated from your history: <span className="num">×{scale.toFixed(2)}</span> demand{scale === 0.5 || scale === 2 ? " (capped)" : ""}</>
                : "History saved; used to calibrate demand."}
            </span>
            {summary.skipped ? <span className="sub num">{summary.skipped} row{summary.skipped === 1 ? "" : "s"} without a date skipped</span> : null}
          </div>
          {columns && <div className="sub truncate" title={columns}>Columns: {columns}</div>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="sub">{label}</div>
      <div className={`num ${small ? "text-[12px]" : "text-[14px]"} font-medium truncate`} title={value}>{value}</div>
    </div>
  );
}
