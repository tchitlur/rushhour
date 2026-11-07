"use client";
// "Set up your own" form: template + size + overrides -> buildScenario -> saveRestaurant -> /app?r=<id>.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CUISINES, NEIGHBORHOODS, buildScenario, saveRestaurant, getCuisine, approxAov, SIZE_FACTOR, type Size } from "@/data/templates";
import type { MenuItem } from "@/sim/types";
import { keywordFields, type SetupFields } from "./describe";
import MenuStep from "./MenuStep";
import HistoryImport from "./HistoryImport";
import { calibrationScale, baselineOrdersPerNight, type HistorySummary } from "@/lib/csv";

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

interface FormState { name: string; cuisine: string; neighborhood: string; size: Size; deliveryPct: number; hoursOpen: string; hoursClose: string; staffCount: number; aov: number }

function defaultsFor(cuisine: string): Pick<FormState, "deliveryPct" | "hoursOpen" | "hoursClose" | "staffCount" | "aov"> {
  const c = getCuisine(cuisine);
  return {
    deliveryPct: Math.round((c.channelMix.doordash + c.channelMix.ubereats) * 100),
    hoursOpen: toHHMM(c.hours.open), hoursClose: toHHMM(c.hours.close),
    staffCount: c.staff.length, aov: Math.round(approxAov(c.menu)),
  };
}

/** Fresh copy of a cuisine template's menu (the editable "Menu" section starts from this). */
const templateMenu = (cuisine: string): MenuItem[] => getCuisine(cuisine).menu.map(m => ({ ...m, stations: [...m.stations] }));
/** Scale menu prices so the weighted average ticket matches `aov` (same rule buildScenario applies to a template). */
function scaleMenuTo(menu: MenuItem[], aov: number): MenuItem[] {
  const cur = approxAov(menu);
  if (!(aov > 0) || !(cur > 0) || Math.abs(cur - aov) < 0.5) return menu;
  const k = aov / cur;
  return menu.map(m => ({ ...m, price: Math.round(m.price * k * 2) / 2, foodCost: Math.round(m.foodCost * k * 10) / 10 }));
}

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="flex flex-col gap-1 text-[12px] text-fg-2">
    <span className="flex justify-between"><span>{label}</span>{hint && <span className="num text-fg-3">{hint}</span>}</span>
    {children}
  </label>
);
const inputCls = "h-8 px-2 rounded border border-line bg-bg-2 text-[13px] text-fg focus:outline-none focus:border-fg";

export default function SetupForm() {
  const router = useRouter();
  const [f, setF] = useState<FormState>({ name: "", cuisine: "pizza", neighborhood: "Oakland", size: "medium", ...defaultsFor("pizza") });
  const [desc, setDesc] = useState("");
  const [filling, setFilling] = useState(false);
  const [fillNote, setFillNote] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  // editable menu (pre-filled from the chosen template) and optional imported order history
  const [menu, setMenu] = useState<MenuItem[]>(() => templateMenu("pizza"));
  const [history, setHistory] = useState<HistorySummary | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(s => ({ ...s, [k]: v }));
  const setCuisine = (cuisine: string) => { setF(s => ({ ...s, cuisine, ...defaultsFor(cuisine) })); setMenu(templateMenu(cuisine)); };
  // AOV and menu prices stay consistent in both directions: editing prices updates AOV, editing AOV rescales prices.
  const onMenuChange = (next: MenuItem[]) => { setMenu(next); if (next.length) setF(s => ({ ...s, aov: Math.round(approxAov(next)) })); };
  const setAov = (aov: number) => { set("aov", aov); setMenu(m => scaleMenuTo(m, aov)); };

  /** template baseline orders per night for the chosen cuisine and size (what history is compared against) */
  const baselineNight = useMemo(() => baselineOrdersPerNight(getCuisine(f.cuisine).demand.map(v => Math.max(1, Math.round(v * SIZE_FACTOR[f.size])))), [f.cuisine, f.size]);

  const apply = (x: SetupFields, source: string) => {
    const cuisineChanged = !!(x.cuisine && CUISINES.some(c => c.id === x.cuisine));
    if (cuisineChanged || x.aov != null) {
      setMenu(m => { const base = cuisineChanged ? templateMenu(x.cuisine!) : m; return x.aov != null ? scaleMenuTo(base, Math.round(x.aov)) : base; });
    }
    setF(s => {
      const n = { ...s };
      if (cuisineChanged) Object.assign(n, { cuisine: x.cuisine, ...defaultsFor(x.cuisine!) });
      if (x.name) n.name = x.name;
      if (x.neighborhood && NEIGHBORHOODS.some(nb => nb.name === x.neighborhood)) n.neighborhood = x.neighborhood;
      if (x.size) n.size = x.size;
      if (x.deliveryPct != null) n.deliveryPct = Math.round(x.deliveryPct);
      if (x.staffCount != null) n.staffCount = x.staffCount;
      if (x.aov != null) n.aov = Math.round(x.aov);
      if (x.hoursOpen) n.hoursOpen = x.hoursOpen.padStart(5, "0");
      if (x.hoursClose) n.hoursClose = x.hoursClose.padStart(5, "0");
      return n;
    });
    const filled = Object.entries(x).filter(([, v]) => v != null && v !== "").map(([k]) => k);
    setFillNote(filled.length ? `Filled ${filled.join(", ")} (${source}). Edit anything below.` : "Couldn't find setup details in that sentence; pick them below.");
  };

  const fill = async () => {
    if (!desc.trim()) return;
    setFilling(true); setFillNote(null);
    let fields: SetupFields | null = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const r = await fetch("/api/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: desc }), signal: ctrl.signal });
      clearTimeout(timer);
      const j = await r.json() as { fields: SetupFields | null };
      fields = j.fields;
    } catch { fields = null; }
    if (fields) apply(fields, "AI"); else apply(keywordFields(desc), "keyword match");
    setFilling(false);
  };

  const build = () => {
    setBuilding(true);
    const name = f.name.trim() || `${getCuisine(f.cuisine).name} in ${f.neighborhood}`;
    // the edited menu replaces the template's (so no AOV rescaling here: prices are exactly what the table shows)
    const sc = buildScenario(f.cuisine, { size: f.size, name, neighborhood: f.neighborhood, deliveryPct: f.deliveryPct, staffCount: f.staffCount, hoursOpen: toMin(f.hoursOpen), hoursClose: toMin(f.hoursClose) });
    sc.menu = (menu.length ? menu : templateMenu(f.cuisine)).map(m => ({ ...m, stations: [...m.stations] }));
    if (history) {
      // calibrate demand to the owner's Fridays: scale the baseline curve, clamped 0.5..2
      const k = calibrationScale(history, baselineOrdersPerNight(sc.baselineOrdersPerHour));
      sc.baselineOrdersPerHour = sc.baselineOrdersPerHour.map(v => Math.max(1, Math.round(v * k)));
      sc.notes = [...(sc.notes ?? []), `Demand calibrated ×${k.toFixed(2)} from ${history.orders} past orders (${history.from} to ${history.to}).`];
      // Scenario.restaurant has no `history` field in sim/types (not touched here); stored as an extra property.
      if (sc.restaurant) (sc.restaurant as typeof sc.restaurant & { history?: HistorySummary }).history = history;
    }
    const id = saveRestaurant(name, sc);
    router.push(`/app?r=${encodeURIComponent(id)}`);
  };

  return (
    <div className="panel p-5 flex flex-col gap-4">
      <div>
        <label className="text-[12px] text-fg-2" htmlFor="describe">Describe your restaurant in a sentence…</label>
        <div className="mt-1 flex gap-2 items-start">
          <textarea id="describe" value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="e.g. A small ramen shop in Lawrenceville, 3 cooks, mostly delivery, open 11 to 10" className={`${inputCls} flex-1 h-auto py-1.5 resize-none`} />
          <button className="btn h-8 whitespace-nowrap" onClick={fill} disabled={filling || !desc.trim()}>{filling ? "Reading…" : "Fill from description"}</button>
        </div>
        {fillNote && <div className="sub mt-1">{fillNote}</div>}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Restaurant name"><input className={inputCls} value={f.name} onChange={e => set("name", e.target.value)} placeholder={`${getCuisine(f.cuisine).name} in ${f.neighborhood}`} /></Field>
        <Field label="Cuisine">
          <select className={inputCls} value={f.cuisine} onChange={e => setCuisine(e.target.value)}>{CUISINES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </Field>
        <Field label="Neighborhood (Pittsburgh)">
          <select className={inputCls} value={f.neighborhood} onChange={e => set("neighborhood", e.target.value)}>{NEIGHBORHOODS.map(n => <option key={n.id} value={n.name}>{n.name}</option>)}</select>
        </Field>
        <Field label="Size">
          <div className="flex rounded border border-line overflow-hidden h-8">
            {(["small", "medium", "large"] as Size[]).map(sz => (
              <button key={sz} type="button" onClick={() => set("size", sz)} className={`flex-1 text-[13px] capitalize ${f.size === sz ? "bg-fg text-white" : "text-fg-2 hover:bg-bg-3"} ${sz !== "small" ? "border-l border-line" : ""}`}>{sz}</button>
            ))}
          </div>
        </Field>
        <Field label="Delivery share" hint={`${f.deliveryPct}%`}>
          <input type="range" min={0} max={100} step={5} value={f.deliveryPct} onChange={e => set("deliveryPct", Number(e.target.value))} className="h-8 accent-fg" />
        </Field>
        <Field label="Hours">
          <div className="flex items-center gap-2">
            <input type="time" step={900} className={`${inputCls} flex-1 num`} value={f.hoursOpen} onChange={e => set("hoursOpen", e.target.value)} />
            <span className="text-fg-3">to</span>
            <input type="time" step={900} className={`${inputCls} flex-1 num`} value={f.hoursClose} onChange={e => set("hoursClose", e.target.value)} />
          </div>
        </Field>
        <Field label="Staff on a typical night"><input type="number" min={1} max={12} className={`${inputCls} num`} value={f.staffCount} onChange={e => set("staffCount", Math.max(1, Math.min(12, Number(e.target.value) || 1)))} /></Field>
        <Field label="Average order value ($)"><input type="number" min={3} max={200} className={`${inputCls} num`} value={f.aov} onChange={e => setAov(Math.max(3, Number(e.target.value) || 3))} /></Field>
      </div>

      <section className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="panel-title">Menu</h3>
          <span className="sub">Pre-filled from the {getCuisine(f.cuisine).name} template. Edit prices, prep times, routing and share of orders.</span>
        </div>
        <MenuStep menu={menu} stations={Object.entries(getCuisine(f.cuisine).stations).map(([id, slot]) => ({ id: id as MenuItem["stations"][number], name: slot.name }))} onChange={onMenuChange} template={templateMenu(f.cuisine)} />
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-3">
        <h3 className="panel-title">Past orders <span className="sub font-normal">(optional)</span></h3>
        <HistoryImport summary={history} onImported={setHistory} onClear={() => setHistory(null)} baselineOrdersPerNight={baselineNight} />
      </section>

      <div className="flex items-center justify-between pt-1">
        <div className="sub">{getCuisine(f.cuisine).tagline}</div>
        <button className="btn btn-primary" onClick={build} disabled={building}>{building ? "Building…" : "Build my kitchen"}</button>
      </div>
    </div>
  );
}
