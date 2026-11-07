"use client";
import { memo, useState } from "react";
import { useApp } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import { CURVEBALLS, LIKELY_QUESTIONS } from "@/data/ask-cache";
import { fmtMoney } from "./Counters";

function AskPanel() {
  const { askResult, askLoading, askStatus, runAsk, playAskNight, askNightActive } = useApp(useShallow(s => ({ askResult: s.askResult, askLoading: s.askLoading, askStatus: s.askStatus, runAsk: s.runAsk, playAskNight: s.playAskNight, askNightActive: s.viewportSource === "ask" })));
  const [q, setQ] = useState("");
  const submit = (question: string) => { if (!question.trim() || askLoading) return; setQ(question); void runAsk(question); };
  const r = askResult;
  const b = r?.baseline.mean, a = r?.patched.mean;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="panel-title">Ask anything</div>
        <div className="text-xs text-fg-3 mt-1">Type a what-if. The AI turns it into an experiment; the simulator answers with numbers.</div>
      </div>
      <form onSubmit={e => { e.preventDefault(); submit(q); }} className="flex gap-2">
        <input id="ask-input" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. the fryer breaks at 7" className="flex-1 rounded-lg bg-bg border border-line px-3 py-2 text-sm outline-none focus:border-accent" />
        <button type="submit" className="btn btn-primary" disabled={askLoading || !q.trim()}>Run</button>
      </form>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-fg-3 font-semibold mb-1">Curveballs</div>
        <div className="flex flex-wrap gap-1.5">
          {CURVEBALLS.map(p => <button key={p.label} className="btn !py-1 !px-2.5 text-xs" onClick={() => submit(p.question)} disabled={askLoading}>{p.label}</button>)}
          {LIKELY_QUESTIONS.slice(0, 3).map(p => <button key={p.label} className="btn btn-ghost !py-1 !px-2.5 text-xs" onClick={() => submit(p.question)} disabled={askLoading}>{p.label}</button>)}
        </div>
      </div>
      {askLoading && <div className="text-sm text-fg-2 animate-pulse">{askStatus || "Working…"}</div>}
      {r && !askLoading && (
        <div className="flex flex-col gap-3 fade-up">
          <div className="text-xs text-fg-3">“{r.question}”</div>
          {r.chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.chips.map(c => <span key={c} className="chip !text-accent-2 !border-accent/40">{c}</span>)}
              <span className="chip">{r.source === "llm" ? "AI-translated" : r.source === "cache" ? "preset" : "rule-translated"} · {(r.ms / 1000).toFixed(1)}s</span>
            </div>
          )}
          {r.patch.unsupported && r.chips.length === 0 ? (
            <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">{r.patch.unsupported}</div>
          ) : b && a ? (
            <>
              <div className="rounded-lg border border-line bg-bg-3 p-3">
                <div className="text-[10px] uppercase tracking-wider text-fg-3 font-semibold mb-1">{r.patch.summary}</div>
                <div className="grid grid-cols-3 gap-2">
                  <D label="Dasher wait" b={b.avgDasherWait} a={a.avgDasherWait} fmt={v => `${v.toFixed(1)}m`} />
                  <D label="Cold" b={b.coldOrders} a={a.coldOrders} fmt={v => v.toFixed(0)} />
                  <D label="At risk" b={b.dollarsAtRisk} a={a.dollarsAtRisk} fmt={fmtMoney} />
                </div>
                <div className="text-[10px] text-fg-3 mt-1">{r.patched.nights} nights, same random draws as the baseline.</div>
                <button className={`btn text-xs mt-2 ${askNightActive ? "!border-accent/50 text-accent" : ""}`} onClick={playAskNight}>{askNightActive ? "Showing this scenario in the kitchen" : "Watch this scenario"}</button>
              </div>
              <div className="text-sm leading-relaxed">{r.answer}</div>
              {r.recovery && r.recovery.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-fg-3 font-semibold mb-1">Recovery plan (tested)</div>
                  {r.recovery.map(c => (
                    <div key={c.id} className="rounded-md border border-ok/30 bg-ok/5 p-2 mb-1.5">
                      <div className="text-sm font-semibold">{c.title}</div>
                      <div className="text-[11px] text-fg-2 num">wait {c.evidence.before.avgDasherWait.toFixed(1)}→<b className="text-fg">{c.evidence.after.avgDasherWait.toFixed(1)}m</b> · risk {fmtMoney(c.evidence.before.dollarsAtRisk)}→<b className="text-fg">{fmtMoney(c.evidence.after.dollarsAtRisk)}</b> · {c.costLabel} · helped {c.evidence.nightsHelped}/{c.evidence.nights}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function D({ label, b, a, fmt }: { label: string; b: number; a: number; fmt: (v: number) => string }) {
  const worse = a > b + 1e-6;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-fg-3">{label}</div>
      <div className="num text-sm"><span className="text-fg-3">{fmt(b)}</span> → <span className={`font-bold text-lg ${worse ? "text-bad" : "text-ok"}`}>{fmt(a)}</span></div>
    </div>
  );
}

export default memo(AskPanel);
