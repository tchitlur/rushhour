"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useApp, snapshotAt, TABS } from "@/store/app";
import Kitchen2D from "@/components/Kitchen2D";
import Counters from "@/components/Counters";
import Timeline from "@/components/Timeline";
import TonightPanel from "@/components/TonightPanel";
import { SERVICE_START } from "@/sim/types";

const Kitchen3D = dynamic(() => import("@/components/Kitchen3D"), { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center text-fg-3 text-sm">Loading 3D kitchen…</div> });

export default function App() {
  const s = useApp();
  const { tab, setTab, view, setView, night, tIdx, loadTonight, advance, playing, highlightStation } = s;
  const [intro, setIntro] = useState(true);

  useEffect(() => { void loadTonight(); }, [loadTonight]);
  useEffect(() => { const id = setTimeout(() => setIntro(false), 1800); return () => clearTimeout(id); }, []);

  // playback loop
  const last = useRef<number | null>(null);
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      if (last.current != null) advance(Math.min(0.1, (now - last.current) / 1000));
      last.current = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [advance]);

  // hotkeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || el?.isContentEditable) return;
      if (tag === "BUTTON" && e.key === " ") return;
      const st = useApp.getState();
      switch (e.key.toLowerCase()) {
        case "p": st.togglePlay(); break;
        case "r": st.reset(); break;
        case "w": st.setTab("Why"); break;
        case " ": e.preventDefault(); st.setTab("Rehearse"); break;
        case "s": st.setTab("Race"); break;
        case "a": st.setTab("Ask"); setTimeout(() => document.getElementById("ask-input")?.focus(), 50); break;
        case "2": st.setView("2d"); break;
        case "3": st.setView("3d"); break;
        case "d": st.setDemoMode(!st.demoMode); break;
        case "?": case "h": st.toggleHotkeys(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const snap = useMemo(() => snapshotAt(night, tIdx), [night, tIdx]);
  const t = snap?.t ?? SERVICE_START;

  return (
    <div className="h-full flex flex-col relative">
      {intro && (
        <div className="absolute inset-0 z-50 bg-bg flex flex-col items-center justify-center fade-up" style={{ animation: "fadeUp .4s ease-out" }}>
          <div className="text-accent text-5xl font-bold tracking-tight">Rush Rehearsal</div>
          <div className="text-fg-2 mt-3 text-lg">Rehearse tonight&apos;s rush before it happens.</div>
          <div className="text-fg-3 mt-8 text-xs uppercase tracking-[.2em]">The AI proposes · the simulator proves</div>
        </div>
      )}
      <header className="h-14 shrink-0 flex items-center gap-5 px-5 border-b border-line bg-bg-2">
        <div className="flex items-baseline gap-2">
          <span className="text-accent font-bold tracking-tight text-lg">Rush Rehearsal</span>
        </div>
        <nav className="flex gap-1">
          {TABS.map(tb => (
            <button key={tb} onClick={() => setTab(tb)} className={`btn btn-ghost !px-3 ${tab === tb ? "!bg-bg-3 !border-line text-fg" : "!border-transparent text-fg-2"}`}>{tb}</button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-fg-3">
          <span className="hidden xl:inline">Maria&apos;s Burgers &amp; Wings · North Shore, Pittsburgh · {s.tonight.date}</span>
          <div className="flex rounded-lg border border-line overflow-hidden">
            <button onClick={() => setView("2d")} className={`px-2.5 py-1 ${view === "2d" ? "bg-bg-3 text-fg" : "text-fg-3"}`}>2D</button>
            <button onClick={() => setView("3d")} className={`px-2.5 py-1 ${view === "3d" ? "bg-bg-3 text-fg" : "text-fg-3"}`}>3D</button>
          </div>
          <button className="btn !py-1 !px-2 text-xs" onClick={s.toggleHotkeys} title="Hotkeys (?)">?</button>
        </div>
      </header>
      <main className="flex-1 grid grid-cols-[300px_1fr_380px] gap-3 p-3 min-h-0">
        <aside className="panel p-4 overflow-y-auto scroll-thin">
          <TonightPanel />
        </aside>
        <section className="panel relative overflow-hidden flex flex-col">
          <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
            <span className="chip">{s.tonight.label}</span>
            {s.loadingNight && <span className="chip">Simulating tonight…</span>}
            {playing && <span className="chip !border-accent/40 text-accent">● LIVE {s.speed}×</span>}
          </div>
          <div className="flex-1 min-h-0 p-3">
            {view === "3d" ? <Kitchen3D snapshot={snap} stations={s.tonight.stations} highlightStation={highlightStation} className="w-full h-full" /> : <Kitchen2D snapshot={snap} stations={s.tonight.stations} highlightStation={highlightStation} />}
          </div>
        </section>
        <aside className="panel p-4 overflow-y-auto scroll-thin">
          <div className="panel-title">{tab === "Tonight" || tab === "Watch" ? "Live" : tab}</div>
          <div className="mt-3"><Counters live={snap?.live ?? null} compact /></div>
        </aside>
      </main>
      <footer className="h-24 shrink-0 border-t border-line bg-bg-2 px-4 py-2 no-print">
        <Timeline bins={snap?.bins ?? null} t={t} />
      </footer>
      {s.showHotkeys && (
        <div className="absolute bottom-28 right-4 z-40 panel p-3 text-xs text-fg-2 fade-up shadow-xl">
          <div className="panel-title mb-2">Hotkeys</div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {[["R", "reset"], ["P", "play / pause"], ["W", "why"], ["Space", "rehearse"], ["S", "split race"], ["C", "curveball menu"], ["A", "focus Ask"], ["2 / 3", "2D / 3D"], ["D", "demo mode"], ["?", "this legend"]].map(([k, v]) => (
              <Fragment key={k}><kbd className="font-mono text-fg bg-bg-3 border border-line rounded px-1.5">{k}</kbd><span>{v}</span></Fragment>
            ))}
          </div>
        </div>
      )}
      {s.toast && (
        <div className={`absolute bottom-28 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg border text-sm font-medium fade-up shadow-xl ${s.toast.kind === "ok" ? "bg-ok/15 border-ok/40 text-ok" : s.toast.kind === "bad" ? "bg-bad/15 border-bad/40 text-bad" : "bg-bg-3 border-line text-fg"}`}>{s.toast.text}</div>
      )}
    </div>
  );
}
