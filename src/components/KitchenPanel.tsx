"use client";
// "Kitchen" tab: edit the restaurant (equipment, staff, menu, operations). Every change goes through
// useApp.updateRestaurant(base => ...) which re-simulates tonight; the sim in the center updates live.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/store/app";
import { baseScenario } from "@/sim/scenario";
import { CHANNELS, STATIONS, fmtClockShort, type Channel, type Scenario, type StationId, type StationKind } from "@/sim/types";
import { CHANNEL_LABEL } from "@/sim/layout";
import { getRestaurantScenario, getRestaurantName, STATION_KINDS } from "@/data/templates";

const inp = "h-7 px-1.5 rounded border border-line bg-bg-2 text-[12px] text-fg focus:outline-none focus:border-fg min-w-0";
const KIND_LABEL: Record<StationKind, string> = { grill: "Grill", fryer: "Fryer", flattop: "Flat-top / plancha", pizza_oven: "Pizza oven / tandoor", oven: "Oven", wok: "Wok / curry line", rice: "Boil / rice", espresso: "Espresso", cold: "Cold line", pack: "Pack / expo", counter: "Counter" };
const SHIFT_STEPS = Array.from({ length: 25 }, (_, i) => 960 + i * 15); // 4:00 PM .. 10:00 PM
const COLORS = ["#C2410C", "#2F6DB5", "#2A7F8F", "#2F855A", "#9A6B12", "#7C3AED", "#B83227", "#1D5FA8"];

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between"><h3 className="panel-title">{title}</h3>{right}</div>
      {children}
    </section>
  );
}

export default function KitchenPanel() {
  const params = useSearchParams();
  const rid = params.get("r");
  const base = useApp(s => s.restaurantBase);
  const loadingNight = useApp(s => s.loadingNight);
  const tonightDate = useApp(s => s.date);
  const update = useApp(s => s.updateRestaurant);
  const setRestaurant = useApp(s => s.setRestaurant);
  const showToast = useApp(s => s.showToast);
  // what the panel edits: the restaurant base, or Maria's defaults when none is set
  const sc: Scenario = useMemo(() => base ?? baseScenario(tonightDate), [base, tonightDate]);

  // debounced updates for sliders (400 ms): keep a pending mutation list and flush once
  const pending = useRef<((b: Scenario) => void)[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const debounced = (key: string, value: number, m: (b: Scenario) => void) => {
    setDraft(d => ({ ...d, [key]: value }));
    pending.current.push(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const ms = pending.current; pending.current = [];
      update(b => { for (const f of ms) f(b); });
      setDraft({});
    }, 400);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const name = sc.restaurant?.name ?? getRestaurantName(rid) ?? "Maria's Burgers & Wings";
  const hoursLabel = sc.restaurant?.hours ? `${fmtClockShort(sc.restaurant.hours.open)}–${fmtClockShort(sc.restaurant.hours.close)}` : null;
  const mixPct = (ch: Channel) => Math.round((draft[`mix:${ch}`] ?? sc.channelMix[ch]) * 100);

  const setMix = (ch: Channel, pct: number) => {
    const v = Math.max(0, Math.min(100, pct)) / 100;
    debounced(`mix:${ch}`, v, b => {
      const others = CHANNELS.filter(c => c !== ch);
      const rest = others.reduce((a, c) => a + b.channelMix[c], 0);
      for (const c of others) b.channelMix[c] = rest > 0 ? (b.channelMix[c] / rest) * (1 - v) : (1 - v) / others.length;
      b.channelMix[ch] = v;
    });
  };

  const reset = () => {
    setRestaurant(getRestaurantScenario(rid));
    showToast("Reset to template · re-simulating", "info");
  };

  return (
    <div className="flex flex-col gap-3 text-[12px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-[14px] truncate">{name}</div>
          <div className="sub">{sc.restaurant ? `${sc.restaurant.neighborhood}${hoursLabel ? ` · open ${hoursLabel}` : ""}` : "North Shore · built-in defaults"}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {loadingNight && <span className="sub text-plan">Re-simulating…</span>}
          <button className="btn !py-1 !px-2 text-xs" onClick={reset} title="Discard edits and rebuild from the template">Reset to template</button>
        </div>
      </div>

      {/* EQUIPMENT */}
      <Section title="Equipment" right={<span className="sub">5 slots · name, kind, capacity (concurrent items)</span>}>
        <div className="flex flex-col gap-1.5">
          {sc.stations.map(st => {
            const fixed = st.id === "pack" || st.id === "counter";
            const present = st.capacity > 0;
            return (
              <div key={st.id} className="grid grid-cols-[14px_1fr_104px_48px_18px_18px] items-center gap-1.5">
                <input type="checkbox" checked={present} disabled={fixed} title={present ? "Remove (capacity 0)" : "Add back"} onChange={e => update(b => { const s = b.stations.find(x => x.id === st.id)!; s.capacity = e.target.checked ? 4 : 0; })} className="accent-fg" />
                <input className={`${inp} ${present ? "" : "text-fg-3 line-through"}`} value={st.name} onChange={e => update(b => { b.stations.find(x => x.id === st.id)!.name = e.target.value; })} />
                <select className={inp} value={st.kind ?? st.id} disabled={fixed} onChange={e => update(b => { b.stations.find(x => x.id === st.id)!.kind = e.target.value as StationKind; })}>
                  {STATION_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                {fixed ? <span className="num text-fg-3 text-right pr-1">—</span> : (
                  <input type="number" min={0} max={20} className={`${inp} num text-right`} value={st.capacity} onChange={e => update(b => { b.stations.find(x => x.id === st.id)!.capacity = Math.max(0, Math.min(20, Number(e.target.value) || 0)); })} />
                )}
                <button className="btn !p-0 h-7 w-[18px] justify-center" disabled={fixed || st.capacity <= 0} title="Remove one unit" onClick={() => update(b => { const s = b.stations.find(x => x.id === st.id)!; s.capacity = Math.max(0, s.capacity - 1); })}>−</button>
                <button className="btn !p-0 h-7 w-[18px] justify-center" disabled={fixed || st.capacity >= 20} title="Add one unit" onClick={() => update(b => { const s = b.stations.find(x => x.id === st.id)!; s.capacity = Math.min(20, s.capacity + 1); })}>+</button>
              </div>
            );
          })}
        </div>
      </Section>

      {/* STAFF */}
      <Section title="Staff" right={
        <button className="btn !py-0.5 !px-2 text-xs" onClick={() => update(b => {
          const i = b.workers.length;
          b.workers.push({ id: `w${Date.now().toString(36)}`, name: `Cook ${i + 1}`, wage: 17, skills: { grill: 1, fryer: 1, cold: 1, pack: 1, counter: 1 }, shifts: [{ start: 1020, end: 1320 }], color: COLORS[i % COLORS.length] });
        })}>+ Add person</button>
      }>
        <div className="flex flex-col gap-2">
          {sc.workers.map(w => {
            const sh = w.shifts[0];
            return (
              <div key={w.id} className="border border-line rounded p-2 flex flex-col gap-1.5" style={{ borderLeftWidth: 3, borderLeftColor: w.color }}>
                <div className="grid grid-cols-[1fr_64px_18px] gap-1.5 items-center">
                  <input className={inp} value={w.name} onChange={e => update(b => { b.workers.find(x => x.id === w.id)!.name = e.target.value; })} />
                  <div className="flex items-center gap-1"><span className="text-fg-3">$</span><input type="number" min={0} max={60} className={`${inp} num w-full`} value={w.wage} title="Wage $/hr (0 = owner)" onChange={e => update(b => { b.workers.find(x => x.id === w.id)!.wage = Math.max(0, Number(e.target.value) || 0); })} /></div>
                  <button className="btn !p-0 h-7 w-[18px] justify-center" title="Remove" onClick={() => update(b => { b.workers = b.workers.filter(x => x.id !== w.id); })}>×</button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-fg-3 w-8">Shift</span>
                  <select className={`${inp} num flex-1`} value={sh ? sh.start : -1} onChange={e => update(b => { const x = b.workers.find(x => x.id === w.id)!; const v = Number(e.target.value); if (v < 0) x.shifts = []; else x.shifts = [{ start: v, end: Math.max(v + 15, x.shifts[0]?.end ?? 1320) }]; })}>
                    <option value={-1}>Off tonight</option>
                    {SHIFT_STEPS.slice(0, -1).map(t => <option key={t} value={t}>{fmtClockShort(t)}</option>)}
                  </select>
                  <span className="text-fg-3">–</span>
                  <select className={`${inp} num flex-1`} value={sh ? sh.end : -1} disabled={!sh} onChange={e => update(b => { const x = b.workers.find(x => x.id === w.id)!; if (x.shifts[0]) x.shifts[0].end = Math.max(x.shifts[0].start + 15, Number(e.target.value)); })}>
                    {!sh && <option value={-1}>—</option>}
                    {SHIFT_STEPS.slice(1).map(t => <option key={t} value={t}>{fmtClockShort(t)}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-fg-3 w-8">Skills</span>
                  {STATIONS.map(sid => {
                    const on = (w.skills[sid] ?? 0) > 0;
                    const label = sc.stations.find(s => s.id === sid)?.name ?? sid;
                    return (
                      <button key={sid} className={`chip ${on ? "!bg-fg !text-white !border-fg" : ""}`} title={on ? `Speed ×${w.skills[sid]} · click to remove` : "Click to add (×1.0)"} onClick={() => update(b => { const x = b.workers.find(x => x.id === w.id)!; if (on) delete x.skills[sid]; else x.skills[sid] = 1; })}>
                        {label}{on && w.skills[sid] !== 1 ? <span className="num opacity-70">×{w.skills[sid]}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!sc.workers.length && <div className="sub">No staff. Add someone or the kitchen will not cook.</div>}
        </div>
      </Section>

      {/* MENU */}
      <Section title="Menu" right={
        <button className="btn !py-0.5 !px-2 text-xs" onClick={() => update(b => { b.menu.push({ id: `item${Date.now().toString(36)}`, name: "New item", price: 10, foodCost: 3, stations: ["grill"], prepMin: 5, prepSd: 0.7, holdMin: 12, popularity: 10 }); })}>+ Add item</button>
      }>
        <table className="data">
          <thead><tr><th>Item</th><th className="r">$</th><th className="r">Prep</th><th>Stations</th><th /></tr></thead>
          <tbody>
            {sc.menu.map(m => (
              <tr key={m.id}>
                <td className="!p-1"><input className={`${inp} w-full`} value={m.name} onChange={e => update(b => { b.menu.find(x => x.id === m.id)!.name = e.target.value; })} /></td>
                <td className="!p-1 w-[56px]"><input type="number" step={0.5} min={0} className={`${inp} num w-full text-right`} value={m.price} onChange={e => update(b => { b.menu.find(x => x.id === m.id)!.price = Math.max(0, Number(e.target.value) || 0); })} /></td>
                <td className="!p-1 w-[52px]"><input type="number" step={0.5} min={0.3} className={`${inp} num w-full text-right`} value={m.prepMin} title="Prep minutes" onChange={e => update(b => { b.menu.find(x => x.id === m.id)!.prepMin = Math.max(0.3, Number(e.target.value) || 0.3); })} /></td>
                <td className="!p-1">
                  <div className="flex gap-0.5 flex-wrap">
                    {(["grill", "fryer", "cold"] as StationId[]).map(sid => {
                      const on = m.stations.includes(sid);
                      const label = (sc.stations.find(s => s.id === sid)?.name ?? sid).split(/[ /]/)[0];
                      return <button key={sid} className={`chip !px-1 ${on ? "!bg-fg !text-white !border-fg" : ""}`} title={`Route through ${label}`} onClick={() => update(b => { const x = b.menu.find(x => x.id === m.id)!; x.stations = on ? x.stations.filter(s => s !== sid) : [...x.stations, sid]; if (!x.stations.length) x.stations = ["cold"]; })}>{label}</button>;
                    })}
                  </div>
                </td>
                <td className="!p-1 w-[22px]"><button className="btn !p-0 h-7 w-[18px] justify-center" title="Remove item" onClick={() => update(b => { b.menu = b.menu.filter(x => x.id !== m.id); })}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* OPERATIONS */}
      <Section title="Operations">
        <div className="flex flex-col gap-1.5">
          <div className="sub">Channel mix (normalized to 100%)</div>
          {CHANNELS.map(ch => (
            <div key={ch} className="grid grid-cols-[72px_1fr_36px] items-center gap-2">
              <span style={{ color: `var(--ch-${ch})` }} className="font-medium">{CHANNEL_LABEL[ch]}</span>
              <input type="range" min={0} max={100} step={1} value={mixPct(ch)} onChange={e => setMix(ch, Number(e.target.value))} className="accent-fg h-5" />
              <span className="num text-right">{mixPct(ch)}%</span>
            </div>
          ))}
          <div className="sub mt-1">Quoted prep time to delivery apps (min)</div>
          {sc.quotedPrep.map((q, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_60px_18px] items-center gap-1.5">
              <select className={`${inp} num`} value={q.start} onChange={e => update(b => { b.quotedPrep[i].start = Number(e.target.value); })}>{SHIFT_STEPS.slice(0, -1).map(t => <option key={t} value={t}>{fmtClockShort(t)}</option>)}</select>
              <select className={`${inp} num`} value={q.end} onChange={e => update(b => { b.quotedPrep[i].end = Number(e.target.value); })}>{SHIFT_STEPS.slice(1).map(t => <option key={t} value={t}>{fmtClockShort(t)}</option>)}</select>
              <input type="number" min={5} max={60} className={`${inp} num text-right`} value={q.minutes} onChange={e => update(b => { b.quotedPrep[i].minutes = Math.max(5, Math.min(60, Number(e.target.value) || 5)); })} />
              <button className="btn !p-0 h-7 w-[18px] justify-center" disabled={sc.quotedPrep.length <= 1} title="Remove window" onClick={() => update(b => { b.quotedPrep.splice(i, 1); })}>×</button>
            </div>
          ))}
          <button className="btn !py-0.5 !px-2 text-xs self-start" onClick={() => update(b => { const last = b.quotedPrep[b.quotedPrep.length - 1]; b.quotedPrep.push({ start: Math.min(1305, last.end), end: 1320, minutes: last.minutes + 5 }); })}>+ Add window</button>
          <div className="sub mt-1">Hours <span className="text-fg-3">· Simulation window is 4–10 PM in this build</span></div>
          <div className="grid grid-cols-[1fr_12px_1fr] items-center gap-1.5">
            <input type="time" step={900} className={`${inp} num`} value={toHHMM(sc.restaurant?.hours?.open ?? 660)} onChange={e => update(b => { ensureRestaurant(b).hours = { open: toMin(e.target.value), close: b.restaurant?.hours?.close ?? 1320 }; })} />
            <span className="text-fg-3 text-center">–</span>
            <input type="time" step={900} className={`${inp} num`} value={toHHMM(sc.restaurant?.hours?.close ?? 1320)} onChange={e => update(b => { ensureRestaurant(b).hours = { open: b.restaurant?.hours?.open ?? 660, close: toMin(e.target.value) }; })} />
          </div>
        </div>
      </Section>
    </div>
  );
}

function toHHMM(min: number) { return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; }
function toMin(hhmm: string) { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); }
function ensureRestaurant(b: Scenario) {
  if (!b.restaurant) b.restaurant = { name: "Maria's Burgers & Wings", cuisine: "burgers", neighborhood: "North Shore", lat: 40.4468, lon: -80.01 };
  return b.restaurant;
}
