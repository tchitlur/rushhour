"use client";
import { memo, useState } from "react";
import { useApp } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import { CURVEBALLS, LIKELY_QUESTIONS } from "@/data/ask-cache";
import { fmtMoney } from "./Counters";

const VIEWS: { id: "before" | "after" | "race"; label: string }[] = [
  { id: "before", label: "Before" },
  { id: "after", label: "After" },
  { id: "race", label: "Side-by-side" },
];

/** Unsupported-question examples: each one is a click away from running. */
const EXAMPLES = ["2 extra cooks come at 6", "The fryer breaks at 7", "Ana leaves at 8", "Add a second fryer", "Snow keeps people home", "Wings take longer to cook tonight"];

function AskPanel() {
  const { askResult, askLoading, askStatus, runAsk, playAskNight, askNightActive, askView, setAskView } = useApp(useShallow(s => ({ askResult: s.askResult, askLoading: s.askLoading, askStatus: s.askStatus, runAsk: s.runAsk, playAskNight: s.playAskNight, askNightActive: s.viewportSource === "ask", askView: s.askView, setAskView: s.setAskView })));
  const [q, setQ] = useState("");
  const submit = (question: string) => { if (!question.trim() || askLoading) return; setQ(question); void runAsk(question); };
  const r = askResult;
  const b = r?.baseline.mean, a = r?.patched.mean;
  const unsupported = !!r && !!r.patch.unsupported && r.chips.length === 0;
  const sourceLabel = r ? (r.source === "llm" ? "AI-translated" : r.source === "cache" ? "preset" : "rule-translated") : "";
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="panel-title">Ask anything</div>
        <div className="sub mt-0.5">Type a what-if. The AI turns it into an experiment; the simulator answers with numbers.</div>
      </div>
      <form onSubmit={e => { e.preventDefault(); submit(q); }} className="flex gap-2">
        <input id="ask-input" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. the fryer breaks at 7" className="flex-1 rounded bg-bg-2 border border-line px-3 py-2 text-sm outline-none focus:border-fg placeholder:text-fg-3" />
        <button type="submit" className="btn btn-primary" disabled={askLoading || !q.trim()}>Run</button>
      </form>
      <div>
        <div className="text-xs text-fg-2 mb-1.5">Curveballs</div>
        <div className="flex flex-wrap gap-1.5">
          {CURVEBALLS.map(p => <button key={p.label} className="btn !py-1 !px-2.5 text-xs" onClick={() => submit(p.question)} disabled={askLoading}>{p.label}</button>)}
          {LIKELY_QUESTIONS.slice(0, 3).map(p => <button key={p.label} className="btn btn-ghost !py-1 !px-2.5 text-xs text-fg-2" onClick={() => submit(p.question)} disabled={askLoading}>{p.label}</button>)}
        </div>
      </div>
      {askLoading && <div className="text-sm text-fg-2">{askStatus || "Working…"}</div>}
      {r && !askLoading && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <div className="text-sm text-fg">“{r.question}”</div>
          {unsupported ? (
            <div className="flex flex-col gap-2">
              <div className="rounded border border-line border-l-[3px] border-l-warn p-3 text-sm leading-relaxed">{r.patch.unsupported}</div>
              <div className="text-xs text-fg-2">Try one of these:</div>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map(ex => <button key={ex} className="btn !py-1 !px-2.5 text-xs" onClick={() => submit(ex)} disabled={askLoading}>{ex}</button>)}
              </div>
            </div>
          ) : b && a ? (
            <>
              {/* 1. the answer, in plain words */}
              <div className="text-sm leading-relaxed">
                <span className="font-semibold">{r.patch.summary}</span> {plainAnswer(b, a)}
              </div>
              {/* 2. before -> after */}
              <div>
                <table className="data">
                  <thead><tr><th>Metric</th><th className="r">Before</th><th className="r">After</th><th className="r">Change</th></tr></thead>
                  <tbody>
                    <D label="Dasher wait" b={b.avgDasherWait} a={a.avgDasherWait} fmt={v => `${v.toFixed(1)}m`} />
                    <D label="Cold orders" b={b.coldOrders} a={a.coldOrders} fmt={v => v.toFixed(0)} />
                    <D label="At risk" b={b.dollarsAtRisk} a={a.dollarsAtRisk} fmt={fmtMoney} />
                  </tbody>
                </table>
                <div className="text-xs text-fg-3 mt-1.5"><span className="num">{r.patched.nights}</span> nights, same random draws as the baseline.</div>
              </div>
              {/* show it in the kitchen */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button className={`btn text-xs ${askNightActive ? "!border-plan text-plan" : "btn-primary"}`} onClick={() => { if (!askNightActive) void playAskNight(); }} disabled={askNightActive}>{askNightActive ? "Showing in kitchen" : "Show in kitchen"}</button>
                  <div className="inline-flex rounded border border-line overflow-hidden" role="tablist" aria-label="What-if view">
                    {VIEWS.map(v => (
                      <button key={v.id} role="tab" aria-selected={askView === v.id} className={`px-2.5 py-1 text-xs border-r border-line last:border-r-0 ${askView === v.id ? "bg-plan text-white font-semibold" : "bg-bg-2 text-fg-2 hover:text-fg"}`} onClick={() => setAskView(v.id)}>{v.label}</button>
                    ))}
                  </div>
                </div>
                {askNightActive && <div className="text-xs text-fg-3">The kitchen is playing this what-if with tonight&apos;s customers and luck. Press 3 for the 3D view.</div>}
              </div>
              {/* 3. what changed, and where the translation came from */}
              {r.chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  {r.chips.map((c, i) => <span key={`${i}-${c}`} className="chip !text-fg !border-fg-3">{c}</span>)}
                  <span className="text-xs text-fg-3">{sourceLabel} · <span className="num">{(r.ms / 1000).toFixed(1)}s</span></span>
                </div>
              )}
              {r.patch.unsupported && <div className="text-xs text-fg-2">{r.patch.unsupported}</div>}
              {/* 4. recovery plan */}
              {r.recovery && r.recovery.length > 0 ? (
                <div className="border-t border-line pt-3">
                  <div className="panel-title">Recovery plan</div>
                  <div className="sub mb-1.5">Quick test on <span className="num">60</span> nights</div>
                  <table className="data">
                    <thead><tr><th>Fix</th><th className="r">Wait</th><th className="r">At risk</th><th className="r">Cost</th><th className="r">Helped</th></tr></thead>
                    <tbody>
                      {r.recovery.map(c => (
                        <tr key={c.id}>
                          <td className="text-[13px] font-semibold text-fg">{c.title}</td>
                          <td className="r num whitespace-nowrap">{c.evidence.after.avgDasherWait.toFixed(1)}m<div className="text-fg-3 text-[11px]">{c.evidence.before.avgDasherWait.toFixed(1)}</div></td>
                          <td className="r num whitespace-nowrap">{fmtMoney(c.evidence.after.dollarsAtRisk)}<div className="text-fg-3 text-[11px]">{fmtMoney(c.evidence.before.dollarsAtRisk)}</div></td>
                          <td className="r num whitespace-nowrap">{c.costLabel}</td>
                          <td className="r num whitespace-nowrap">{c.evidence.nightsHelped}/{c.evidence.nights}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : a.dollarsAtRisk > b.dollarsAtRisk + 15 ? (
                <div className="text-xs text-fg-2 border-t border-line pt-3"><span className="font-semibold text-fg">Recovery plan:</span> no tested fix pays for itself under this scenario.</div>
              ) : null}
              {/* 5. more to try */}
              <div className="border-t border-line pt-3">
                <div className="text-xs text-fg-2 mb-1.5">Try next</div>
                <div className="flex flex-wrap gap-1.5">
                  {LIKELY_QUESTIONS.filter(p => p.question !== r.question).slice(0, 6).map(p => <button key={p.label} className="btn btn-ghost !py-1 !px-2.5 text-xs text-fg-2" onClick={() => submit(p.question)} disabled={askLoading}>{p.label}</button>)}
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** One or two plain sentences: what happens to the night, numbers first. */
function plainAnswer(b: { avgDasherWait: number; coldOrders: number; dollarsAtRisk: number }, a: { avgDasherWait: number; coldOrders: number; dollarsAtRisk: number }): string {
  const dWait = a.avgDasherWait - b.avgDasherWait, dRisk = a.dollarsAtRisk - b.dollarsAtRisk, dCold = a.coldOrders - b.coldOrders;
  if (Math.abs(dCold) < 0.5 && Math.abs(dWait) < 0.3 && Math.abs(dRisk) < 15) return `Barely moves the night: Dasher wait stays around ${a.avgDasherWait.toFixed(1)} min and about $${Math.round(a.dollarsAtRisk)} stays at risk.`;
  const worse = dRisk > 0;
  const first = worse
    ? `Makes the night harder: Dasher wait ${b.avgDasherWait.toFixed(1)} → ${a.avgDasherWait.toFixed(1)} min and dollars at risk $${Math.round(b.dollarsAtRisk)} → $${Math.round(a.dollarsAtRisk)} (+$${Math.round(dRisk)}).`
    : `Helps: Dasher wait ${b.avgDasherWait.toFixed(1)} → ${a.avgDasherWait.toFixed(1)} min and dollars at risk $${Math.round(b.dollarsAtRisk)} → $${Math.round(a.dollarsAtRisk)} (−$${Math.round(-dRisk)}).`;
  const second = Math.abs(dCold) >= 0.5 ? ` Cold orders go ${b.coldOrders.toFixed(0)} → ${a.coldOrders.toFixed(0)}.` : "";
  return first + second;
}

function D({ label, b, a, fmt }: { label: string; b: number; a: number; fmt: (v: number) => string }) {
  const worse = a > b + 1e-6;
  const same = Math.abs(a - b) < 1e-6;
  return (
    <tr>
      <td className="text-[13px]">{label}</td>
      <td className="r num text-fg-2">{fmt(b)}</td>
      <td className={`r num text-[13px] font-semibold ${worse ? "text-bad" : same ? "text-fg" : "text-ok"}`}>{fmt(a)}</td>
      <td className={`r text-[11px] ${worse ? "text-bad" : same ? "text-fg-3" : "text-ok"}`}>{worse ? "worse" : same ? "same" : "better"}</td>
    </tr>
  );
}

export default memo(AskPanel);
