"use client";
// Editable menu table shared by the setup page (full width) and the Kitchen tab (380 px panel).
// Pure/controlled: every edit calls onChange with a new MenuItem[]; ids stay stable (slugified from the
// name at creation, made unique), so mixShift / removedItems / prepBatches keep pointing at the same dish.
import { useMemo } from "react";
import type { MenuItem, StationId } from "@/sim/types";

export interface MenuStepProps {
  menu: MenuItem[];
  /** the scenario's 5 engine slots with their display names */
  stations: { id: StationId; name: string }[];
  onChange: (menu: MenuItem[]) => void;
  /** when given, a "Reset to template" button restores this menu */
  template?: MenuItem[];
  /** compact layout for the 380 px side panel */
  compact?: boolean;
}

export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "dish";
}
export function uniqueId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

const inp = "h-7 px-1.5 rounded border border-line bg-bg-2 text-[12px] text-fg focus:outline-none focus:border-fg min-w-0 w-full";
const num = (v: number, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "0");
const shortName = (s: string) => s.split(/\s*[/·]\s*/)[0].split(" ").slice(0, 2).join(" ");

export default function MenuStep({ menu, stations, onChange, template, compact }: MenuStepProps) {
  const totalPop = useMemo(() => menu.reduce((a, m) => a + Math.max(0, m.popularity), 0), [menu]);
  const sharePct = (m: MenuItem) => (totalPop > 0 ? (Math.max(0, m.popularity) / totalPop) * 100 : 0);

  const patch = (id: string, f: (m: MenuItem) => MenuItem) => onChange(menu.map(m => (m.id === id ? f({ ...m, stations: [...m.stations] }) : m)));

  const setShare = (id: string, pct: number) => {
    // choose a popularity so this dish's share becomes pct while the others keep their relative weights
    const s = Math.max(0, Math.min(99, pct)) / 100;
    const me = menu.find(m => m.id === id);
    if (!me) return;
    const others = totalPop - Math.max(0, me.popularity);
    const next = others > 0 ? (s * others) / (1 - s) : (s > 0 ? 1 : 0);
    patch(id, m => ({ ...m, popularity: Math.round(next * 100) / 100 }));
  };

  const addRow = () => {
    const name = "New dish";
    const id = uniqueId(slugify(name), menu.map(m => m.id));
    const primary: StationId = stations.find(s => s.id !== "pack" && s.id !== "counter")?.id ?? "grill";
    const avgPop = menu.length ? totalPop / menu.length : 10;
    onChange([...menu, { id, name, price: 10, foodCost: 3, stations: [primary], prepMin: 5, prepSd: 0.7, holdMin: 12, popularity: Math.round(avgPop * 10) / 10 || 10 }]);
  };
  const remove = (id: string) => onChange(menu.filter(m => m.id !== id));
  const reset = () => { if (template) onChange(template.map(m => ({ ...m, stations: [...m.stations] }))); };

  const routable = stations.filter(s => s.id !== "pack" && s.id !== "counter");
  const extra = stations.filter(s => s.id === "pack" || s.id === "counter");

  return (
    <div className="flex flex-col gap-2 text-[12px]">
      <div className="flex items-center justify-between gap-2">
        <span className="sub">{menu.length} dishes · share of orders sums to 100%</span>
        <div className="flex items-center gap-1.5">
          {template && <button type="button" className="btn !py-0.5 !px-2 text-xs" onClick={reset} title="Restore the template's menu">Reset to template</button>}
          <button type="button" className="btn !py-0.5 !px-2 text-xs" onClick={addRow}>+ Add dish</button>
        </div>
      </div>

      <div className={compact ? "" : "overflow-x-auto"}>
        <table className="data" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col />
            <col style={{ width: compact ? 54 : 72 }} />
            <col style={{ width: compact ? 48 : 64 }} />
            {!compact && <col style={{ width: 260 }} />}
            <col style={{ width: compact ? 50 : 64 }} />
            <col style={{ width: compact ? 48 : 64 }} />
            <col style={{ width: 24 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Dish{compact ? " · stations" : ""}</th>
              <th className="r" title="Menu price">$</th>
              <th className="r" title="Mean prep minutes at the first station">Prep</th>
              {!compact && <th title="Stations the dish passes through, in order">Stations</th>}
              <th className="r" title="Share of orders (popularity, normalized to 100%)">Share</th>
              <th className="r" title="Minutes before a finished dish counts as cold">Hold</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {menu.map(m => {
              const chips = (
                <div className="flex gap-0.5 flex-wrap">
                  {[...routable, ...extra].map(st => {
                    const on = m.stations.includes(st.id);
                    const label = compact ? shortName(st.name) : st.name;
                    return (
                      <button key={st.id} type="button" className={`chip !px-1 ${on ? "!bg-fg !text-white !border-fg" : ""}`} title={on ? `Routed through ${st.name} · click to remove` : `Route through ${st.name}`}
                        onClick={() => patch(m.id, x => { const next = on ? x.stations.filter(s => s !== st.id) : [...x.stations, st.id]; return { ...x, stations: next.length ? next : ["cold"] }; })}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              );
              return (
                <tr key={m.id}>
                  <td className="!p-1">
                    <input className={inp} value={m.name} aria-label="Dish name" onChange={e => patch(m.id, x => ({ ...x, name: e.target.value }))} />
                    {compact && <div className="mt-1">{chips}</div>}
                  </td>
                  <td className="!p-1"><input type="number" step={0.5} min={0} className={`${inp} num text-right`} aria-label="Price" value={m.price}
                    onChange={e => patch(m.id, x => { const p = Math.max(0, Number(e.target.value) || 0); const ratio = x.price > 0 ? x.foodCost / x.price : 0.3; return { ...x, price: p, foodCost: Math.round(p * ratio * 100) / 100 }; })} /></td>
                  <td className="!p-1"><input type="number" step={0.5} min={0.3} className={`${inp} num text-right`} aria-label="Prep minutes" value={m.prepMin}
                    onChange={e => patch(m.id, x => { const p = Math.max(0.3, Number(e.target.value) || 0.3); return { ...x, prepMin: p, prepSd: Math.round(Math.max(0.1, p * 0.13) * 100) / 100 }; })} /></td>
                  {!compact && <td className="!p-1">{chips}</td>}
                  <td className="!p-1"><input type="number" step={1} min={0} max={99} className={`${inp} num text-right`} aria-label="Share of orders, percent" value={num(sharePct(m))}
                    onChange={e => setShare(m.id, Number(e.target.value) || 0)} /></td>
                  <td className="!p-1"><input type="number" step={1} min={1} className={`${inp} num text-right`} aria-label="Hold minutes" value={m.holdMin}
                    onChange={e => patch(m.id, x => ({ ...x, holdMin: Math.max(1, Math.round(Number(e.target.value) || 1)) }))} /></td>
                  <td className="!p-1"><button type="button" className="btn !p-0 h-7 w-[18px] justify-center" title="Remove dish" onClick={() => remove(m.id)}>×</button></td>
                </tr>
              );
            })}
            {!menu.length && <tr><td colSpan={compact ? 6 : 7} className="sub">No dishes. Add one or reset to the template; an empty menu cannot be simulated.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
