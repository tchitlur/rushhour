"use client";
// "Set up your own" form: template + size + overrides -> buildScenario -> saveRestaurant -> /app?r=<id>.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CUISINES, NEIGHBORHOODS, buildScenario, saveRestaurant, getCuisine, approxAov, type Size } from "@/data/templates";
import { keywordFields, type SetupFields } from "./describe";

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

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(s => ({ ...s, [k]: v }));
  const setCuisine = (cuisine: string) => setF(s => ({ ...s, cuisine, ...defaultsFor(cuisine) }));

  const apply = (x: SetupFields, source: string) => {
    setF(s => {
      const n = { ...s };
      if (x.cuisine && CUISINES.some(c => c.id === x.cuisine)) Object.assign(n, { cuisine: x.cuisine, ...defaultsFor(x.cuisine) });
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
    const sc = buildScenario(f.cuisine, { size: f.size, name, neighborhood: f.neighborhood, deliveryPct: f.deliveryPct, staffCount: f.staffCount, aov: f.aov, hoursOpen: toMin(f.hoursOpen), hoursClose: toMin(f.hoursClose) });
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
        <Field label="Average order value ($)"><input type="number" min={3} max={200} className={`${inputCls} num`} value={f.aov} onChange={e => set("aov", Math.max(3, Number(e.target.value) || 3))} /></Field>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="sub">{getCuisine(f.cuisine).tagline}</div>
        <button className="btn btn-primary" onClick={build} disabled={building}>{building ? "Building…" : "Build my kitchen"}</button>
      </div>
    </div>
  );
}
