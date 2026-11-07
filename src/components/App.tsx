"use client";
import { useEffect, useState } from "react";

const TABS = ["Tonight", "Watch", "Why", "Rehearse", "Race", "Ask"] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Tonight");
  const [health, setHealth] = useState<string>("checking…");
  useEffect(() => {
    fetch("/api/health").then(r => r.json()).then(j => setHealth(JSON.stringify(j))).catch(e => setHealth(String(e)));
  }, []);
  return (
    <div className="h-full flex flex-col">
      <header className="h-14 flex items-center gap-6 px-5 border-b border-line bg-bg-2">
        <div className="flex items-baseline gap-2">
          <span className="text-accent font-bold tracking-tight">Rush Rehearsal</span>
          <span className="text-fg-3 text-xs hidden lg:inline">Rehearse tonight&apos;s rush before it happens.</span>
        </div>
        <nav className="flex gap-1 ml-4">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`btn btn-ghost ${tab === t ? "!bg-bg-3 !border-line" : "!border-transparent text-fg-2"}`}>{t}</button>
          ))}
        </nav>
        <div className="ml-auto text-xs text-fg-3">Maria&apos;s Burgers &amp; Wings · North Shore, Pittsburgh</div>
      </header>
      <main className="flex-1 grid grid-cols-[320px_1fr_380px] gap-3 p-3 min-h-0">
        <aside className="panel p-4"><div className="panel-title">Tonight</div></aside>
        <section className="panel p-4 flex items-center justify-center text-fg-3">Kitchen viewport ({tab})</section>
        <aside className="panel p-4"><div className="panel-title">Why · Plan · Ask</div></aside>
      </main>
      <footer className="h-24 border-t border-line bg-bg-2 px-5 flex items-center text-xs text-fg-3 font-mono">health: {health}</footer>
    </div>
  );
}
