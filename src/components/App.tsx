"use client";
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import KitchenPanel from "@/components/KitchenPanel";
import { getRestaurantScenario } from "@/data/templates";
import { useApp, snapshotAt, TABS } from "@/store/app";
import Kitchen2D from "@/components/Kitchen2D";
import Counters from "@/components/Counters";
import Timeline from "@/components/Timeline";
import TonightPanel, { fmtDate } from "@/components/TonightPanel";
import RehearsePanel from "@/components/RehearsePanel";
import OutputsPanel from "@/components/OutputsPanel";
import WhyPanel from "@/components/WhyPanel";
import AskPanel from "@/components/AskPanel";
import RaceView from "@/components/RaceView";
import { SERVICE_START } from "@/sim/types";

const Kitchen3D = dynamic(() => import("@/components/Kitchen3D"), { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center text-fg-3 text-sm">Loading 3D kitchen…</div> });

export default function App({ demoRestaurant }: { demoRestaurant?: string } = {}) {
  return (
    <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-fg-3 text-sm">Loading Rush Rehearsal…</div>}>
      <AppInner demoRestaurant={demoRestaurant} />
    </Suspense>
  );
}

function AppInner({ demoRestaurant }: { demoRestaurant?: string }) {
  const s = useApp();
  const { tab, setTab, view, setView, night, tIdx, loadTonight, advance, playing, highlightStation, askNight, viewportSource, askView, setAskView } = s;
  const searchR = useSearchParams().get("r");
  const restaurantId = demoRestaurant ?? searchR;
  const viewStations = viewportSource === "ask" && askView === "after" && s.askScenario ? s.askScenario.stations : s.tonight.stations;
  const [intro, setIntro] = useState<"on" | "out" | "off">("on");
  const restaurantName = s.tonight.restaurant?.name ?? "Maria's Burgers & Wings";
  const neighborhood = s.tonight.restaurant?.neighborhood ?? "North Shore, Pittsburgh";
  // avoid "Noodle Bar Lawrenceville · Lawrenceville": only add the neighborhood when the name doesn't already say it
  const showHood = !restaurantName.toLowerCase().includes(neighborhood.split(",")[0].trim().toLowerCase());
  const whatIfTitle = s.askResult?.patch.summary ?? "";

  useEffect(() => {
    // pick the restaurant from ?r= before the first intake so the scenario builds on the right base (null / "maria" = Maria's)
    s.setRestaurant(getRestaurantScenario(restaurantId));
    void loadTonight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, loadTonight]);
  useEffect(() => {
    const a = setTimeout(() => setIntro("out"), 1200);
    const b = setTimeout(() => setIntro("off"), 1350);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

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
      const inputType = tag === "INPUT" ? ((el as HTMLInputElement).type || "text") : "";
      const isTextField = tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable || (tag === "INPUT" && !/checkbox|radio|button|range/.test(inputType));
      if (isTextField) return;
      // a judge who just clicked a button or checkbox still expects hotkeys to work
      if (tag === "BUTTON" || tag === "INPUT" || tag === "LABEL") { e.preventDefault(); el.blur(); }
      const st = useApp.getState();
      switch (e.key.toLowerCase()) {
        case "p": st.togglePlay(); break;
        case "r": st.reset(); break;
        case "w": st.setTab("Why"); break;
        case " ": e.preventDefault(); st.setTab("Rehearse"); break;
        case "s": st.setTab("Race"); break;
        case "a": st.setTab("Ask"); setTimeout(() => document.getElementById("ask-input")?.focus(), 50); break;
        case "c": st.setTab("Ask"); break;
        case "2": st.setView("2d"); break;
        case "3": st.setView("3d"); break;
        case "d": st.setDemoMode(!st.demoMode); break;
        case "?": case "h": st.toggleHotkeys(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shownNight = viewportSource === "ask" && askNight && askView !== "before" ? askNight : night;
  const showAskRace = viewportSource === "ask" && askView === "race" && tab !== "Race";
  const snap = useMemo(() => snapshotAt(shownNight, tIdx), [shownNight, tIdx]);
  const t = snap?.t ?? SERVICE_START;

  return (
    <div className="h-full flex flex-col relative">
      {intro !== "off" && (
        <div className={`absolute inset-0 z-50 bg-bg flex items-center justify-center ${intro === "out" ? "intro-out" : ""}`}>
          <div className="panel px-10 py-8 min-w-[420px]">
            <div className="text-fg text-[28px] font-semibold tracking-tight leading-none">Rush Rehearsal</div>
            <div className="text-fg-2 mt-3 text-base">Rehearse tonight&apos;s rush before it happens.</div>
            <div className="text-fg-3 mt-6 text-xs">AI proposes. The simulator proves.</div>
          </div>
        </div>
      )}
      <header className="h-12 shrink-0 flex items-center gap-6 px-4 border-b border-line bg-bg-2 no-print">
        <div className="flex items-baseline gap-2">
          <span className="text-fg font-semibold tracking-tight text-[15px]">Rush Rehearsal</span>
        </div>
        <nav className="flex h-full">
          {TABS.map(tb => (
            <button key={tb} onClick={() => setTab(tb)} className={`px-3 h-full text-[13px] border-b-2 -mb-px transition-colors ${tab === tb ? "border-fg text-fg font-semibold" : "border-transparent text-fg-2 hover:text-fg"}`}>{tb}</button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-fg-2">
          <span className="hidden lg:inline truncate max-w-[360px]" title={`${restaurantName} · ${neighborhood}`}><span className="text-fg font-medium">{restaurantName}</span>{showHood ? ` · ${neighborhood}` : ""} · <span className="num">{fmtDate(s.tonight.date)}</span></span>
          <Link href="/" className="btn !py-1 !px-2 text-xs">Switch restaurant</Link>
          <div className="flex rounded border border-line overflow-hidden text-xs">
            <button onClick={() => setView("2d")} className={`px-2.5 py-1 ${view === "2d" ? "bg-fg text-white" : "text-fg-2 hover:bg-bg-3"}`}>2D</button>
            <button onClick={() => setView("3d")} className={`px-2.5 py-1 border-l border-line ${view === "3d" ? "bg-fg text-white" : "text-fg-2 hover:bg-bg-3"}`}>3D</button>
          </div>
          <button className="btn !py-1 !px-2 text-xs" onClick={s.toggleHotkeys} title="Hotkeys (?)">Keys</button>
        </div>
      </header>
      <main className={`flex-1 grid gap-2 p-2 min-h-0 ${tab === "Race" ? "grid-cols-[1fr_380px]" : "grid-cols-[300px_1fr_380px]"}`}>
        {tab !== "Race" && (
          <aside className="panel p-4 overflow-y-auto scroll-thin no-print">
            <TonightPanel />
          </aside>
        )}
        <section className="panel relative overflow-hidden flex flex-col no-print">
          {viewportSource === "ask" && tab !== "Race" && (
            <div className="shrink-0 flex items-center gap-3 px-3 py-1.5 border-b border-line bg-bg-2 text-xs min-h-[36px]">
              <span className="text-plan font-semibold truncate min-w-0 flex-1" title={`What-if: ${whatIfTitle}`}>What-if: <span className="font-normal text-fg">{whatIfTitle}</span></span>
              <div className="ml-auto flex rounded border border-line overflow-hidden shrink-0">
                {(["before", "after", "race"] as const).map((v, i) => (
                  <button key={v} onClick={() => setAskView(v)} className={`px-2.5 py-0.5 ${i > 0 ? "border-l border-line" : ""} ${askView === v ? "bg-fg text-white" : "text-fg-2 hover:bg-bg-3"}`}>{v === "before" ? "Before" : v === "after" ? "After" : "Side-by-side"}</button>
                ))}
              </div>
              <button className="btn !py-0.5 !px-2 text-xs shrink-0" onClick={() => void s.playAskNight()} title="Back to tonight as planned">× Back to tonight</button>
            </div>
          )}
          <div className={`absolute ${viewportSource === "ask" && tab !== "Race" ? "top-12" : "top-3"} left-3 z-10 flex items-center gap-2 text-xs`}>
            {tab !== "Race" && <span className={`chip ${viewportSource === "ask" ? "!text-plan !border-plan" : ""}`}>{viewportSource === "ask" ? (askView === "before" ? "Before: tonight as planned" : askView === "after" ? "After: what-if" : "Side-by-side") : s.tonight.label}</span>}
            {s.loadingNight && <span className="chip">Simulating tonight…</span>}
            {playing && tab !== "Race" && <span className="chip"><span className="text-bad font-semibold">Live</span> <span className="num">{s.speed}×</span></span>}
          </div>
          <div className="flex-1 min-h-0 p-3">
            {tab === "Race" ? <RaceView /> : showAskRace ? <RaceView mode="ask" /> : view === "3d" ? <Kitchen3D snapshot={snap} stations={viewStations} highlightStation={highlightStation} onMoveStation={(id, x, y) => void s.moveStation(id, x, y)} className="w-full h-full" /> : <Kitchen2D snapshot={snap} stations={viewStations} highlightStation={highlightStation} />}
          </div>
        </section>
        <aside className="panel p-4 overflow-y-auto scroll-thin flex flex-col gap-5 print-only-grow">
          {(tab === "Tonight" || tab === "Watch") && (<div><div className="panel-title">{viewportSource === "ask" ? (askView === "before" ? "Live: tonight as planned" : "Live: what-if scenario") : "Live: tonight as planned"}</div><div className="mt-3"><Counters live={snap?.live ?? null} compact /></div></div>)}
          {tab === "Kitchen" && <KitchenPanel />}
          {tab === "Rehearse" && <><div className="no-print"><RehearsePanel /></div><OutputsPanel /></>}
          {tab === "Why" && <WhyPanel />}
          {tab === "Ask" && <AskPanel />}
          {tab === "Race" && <><RehearsePanel /></>}
        </aside>
      </main>
      <footer className="h-24 shrink-0 border-t border-line bg-bg-2 px-4 py-2 no-print">
        <Timeline bins={snap?.bins ?? null} t={t} />
      </footer>
      {s.showHotkeys && (
        <div className="absolute bottom-28 right-4 z-40 panel p-3 text-xs text-fg-2 shadow-lg">
          <div className="panel-title mb-2">Keys</div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {[["R", "reset"], ["P", "play / pause"], ["W", "why"], ["Space", "rehearse"], ["S", "split race"], ["C", "curveball menu"], ["A", "focus Ask"], ["2 / 3", "2D / 3D"], ["D", "demo mode"], ["?", "this legend"]].map(([k, v]) => (
              <Fragment key={k}><kbd className="num text-fg bg-bg-3 border border-line rounded px-1.5">{k}</kbd><span>{v}</span></Fragment>
            ))}
          </div>
        </div>
      )}
      {s.toast && (
        <div className={`absolute bottom-28 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded border bg-bg-2 text-sm font-medium shadow-lg border-l-4 ${s.toast.kind === "ok" ? "border-line border-l-ok text-fg" : s.toast.kind === "bad" ? "border-line border-l-bad text-fg" : "border-line border-l-fg text-fg"}`}>{s.toast.text}</div>
      )}
    </div>
  );
}
