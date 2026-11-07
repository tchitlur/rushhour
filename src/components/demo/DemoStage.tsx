/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react-hooks/refs, react-hooks/immutability, react-hooks/purity */
"use client";
// Self-playing product demo: drives the REAL app (real components, real data, fixed demo seed) on a 1920×1080 stage
// with a fake cursor, captions, a chapter label and a CSS camera. Demo state never touches localStorage restaurants.
import { useCallback, useEffect, useRef, useState } from "react";
import App from "@/components/App";
import Home from "@/app/page";
import { useApp, snapshotAt } from "@/store/app";
import { SERVICE_START } from "@/sim/types";
import { DEMO_DATE } from "@/data/cache";
import { runAsk as runAskPipeline } from "@/plan/ask";

const W = 1920, H = 1080;
const RESTAURANT = "primanti";
const ASK_Q = "What if two extra cooks come in at 6?";
const DESCRIBE = "a small taco shop in Oakland, mostly delivery";

type View = "title" | "home" | "app" | "end";
interface Cam { s: number; x: number; y: number; ms: number }

class Aborted extends Error {}

export default function DemoStage() {
  const [phase, setPhase] = useState<"pre" | "countdown" | "playing" | "done">("pre");
  const [count, setCount] = useState(3);
  const [view, setView] = useState<View>("home");
  const [chapter, setChapter] = useState<{ n: string; name: string } | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [capKey, setCapKey] = useState(0);
  const [cam, setCam] = useState<Cam>({ s: 1, x: 0, y: 0, ms: 600 });
  const [cursor, setCursor] = useState({ x: 960, y: 540, ripple: 0, visible: false });
  const [paused, setPaused] = useState(false);
  const [scale, setScale] = useState(1);
  const pausedRef = useRef(false);
  const runId = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const [warm, setWarm] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // fit 1920×1080 to the window
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit(); window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit);
  }, []);

  // keyboard: capture phase so the app's own hotkeys never fire during the demo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "pre") { e.stopImmediatePropagation(); if (e.key === " ") { e.preventDefault(); void start(); } return; }
      if (e.key === " ") { e.preventDefault(); e.stopImmediatePropagation(); pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return; }
      if (e.key.toLowerCase() === "r") { e.preventDefault(); e.stopImmediatePropagation(); void start(); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); runId.current++; setPhase("pre"); setView("home"); setCaption(null); setChapter(null); setCam({ s: 1, x: 0, y: 0, ms: 0 }); return; }
      // swallow everything else while playing
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---------- pre-warm (runs once; the app is mounted hidden from the start)
  const prewarm = useCallback(async () => {
    const st = useApp.getState();
    const until = async (fn: () => boolean, ms: number) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) return false; await new Promise(r => setTimeout(r, 100)); } return true; };
    // let the live intake refresh settle first (it replaces the scenario and would reset everything warmed before it)
    await until(() => !useApp.getState().tonightLoading && useApp.getState().tonightSource !== "cache", 15000);
    await until(() => !!useApp.getState().night && !!useApp.getState().tonightMC && useApp.getState().tonight.restaurant?.name?.includes("Primanti") === true, 40000);
    fetch("/api/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: DESCRIBE }) }).catch(() => {});
    if (!useApp.getState().attribution) await st.runWhy("dasherWait");
    await until(() => !!useApp.getState().attribution, 30000);
    if (!useApp.getState().plan) await st.runRehearse();
    await until(() => !!useApp.getState().plan && !!useApp.getState().planNight, 60000);
    await st.runAsk(ASK_Q);
    await until(() => !!useApp.getState().askResult, 60000);
    useApp.setState({ askResult: null, askNight: null, viewportSource: "tonight", tab: "Tonight", tIdx: 0, playing: false });
    setWarm(true);
  }, []);
  useEffect(() => { void prewarm(); }, [prewarm]);

  // ---------- driver helpers
  const start = async () => {
    const id = ++runId.current;
    const alive = () => runId.current === id;
    pausedRef.current = false; setPaused(false);
    setPhase("countdown"); setView("home"); setCaption(null); setChapter(null); setCam({ s: 1, x: 0, y: 0, ms: 0 });
    const st = useApp.getState();
    useApp.setState({ askResult: null, askNight: null, viewportSource: "tonight", tab: "Tonight", tIdx: 0, playing: false, highlightStation: null, view: "2d" });
    st.setSpeed(720);
    for (let c = 3; c >= 1; c--) { setCount(c); await sleep(1000); if (!alive()) return; }
    while (!warm && !useApp.getState().plan) { await sleep(200); if (!alive()) return; }
    setPhase("playing");
    try { await run(alive); setPhase("done"); } catch (e) { if (!(e instanceof Aborted)) console.error(e); }
  };

  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  const wait = async (ms: number, alive: () => boolean) => {
    const end = Date.now() + ms;
    while (Date.now() < end || pausedRef.current) { if (!alive()) throw new Aborted(); if (pausedRef.current) { const p = Date.now(); while (pausedRef.current) { await sleep(50); if (!alive()) throw new Aborted(); } return wait(end - p, alive); } await sleep(30); }
  };
  const until = async (fn: () => boolean, ms: number, alive: () => boolean) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) return false; await wait(80, alive); } return true; };
  const q = (sel: string, text?: string): HTMLElement | null => {
    const root = stageRef.current!;
    const els = Array.from(root.querySelectorAll<HTMLElement>(sel));
    if (!text) return els[0] ?? null;
    return els.find(e => (e.textContent ?? "").trim().toLowerCase().includes(text.toLowerCase())) ?? null;
  };
  const center = (el: HTMLElement) => { const r = el.getBoundingClientRect(); const s = stageRef.current!.getBoundingClientRect(); return { x: (r.left + r.width / 2 - s.left) / scale, y: (r.top + r.height / 2 - s.top) / scale }; };
  const moveTo = async (p: { x: number; y: number }, alive: () => boolean, ms = 650) => {
    const from = { ...cursorPos.current }; const t0 = Date.now();
    setCursor(c => ({ ...c, visible: true }));
    while (true) {
      const u = Math.min(1, (Date.now() - t0) / ms); const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      // slight curve: bow the path perpendicular to travel
      const dx = p.x - from.x, dy = p.y - from.y; const bow = Math.sin(u * Math.PI) * Math.min(40, Math.hypot(dx, dy) * 0.08);
      const nx = from.x + dx * e - dy / (Math.hypot(dx, dy) || 1) * bow, ny = from.y + dy * e + dx / (Math.hypot(dx, dy) || 1) * bow;
      cursorPos.current = { x: nx, y: ny }; setCursor(c => ({ ...c, x: nx, y: ny }));
      if (u >= 1) break; await wait(16, alive);
    }
    cursorPos.current = { ...p }; setCursor(c => ({ ...c, x: p.x, y: p.y }));
    await wait(300, alive);
  };
  const cursorPos = useRef({ x: 960, y: 540 });
  const clickEl = async (el: HTMLElement | null, alive: () => boolean) => {
    if (!el) return false;
    el.scrollIntoView({ block: "nearest" });
    await moveTo(center(el), alive);
    setCursor(c => ({ ...c, ripple: c.ripple + 1 }));
    await wait(120, alive);
    el.click();
    return true;
  };
  const typeInto = async (el: HTMLInputElement | HTMLTextAreaElement, text: string, alive: () => boolean) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
    el.focus();
    for (let i = 1; i <= text.length; i++) { setter.call(el, text.slice(0, i)); el.dispatchEvent(new Event("input", { bubbles: true })); await wait(25 + Math.random() * 10, alive); }
  };
  const say = (t: string | null) => { setCaption(t); setCapKey(k => k + 1); };
  const cap = (n: string, name: string) => setChapter({ n, name });
  const camRef = useRef<Cam>({ s: 1, x: 0, y: 0, ms: 600 });
  const zoom = (s: number, x: number, y: number, ms = 600) => { camRef.current = { s, x, y, ms }; setCam({ s, x, y, ms }); };
  /** element center in UNZOOMED stage coordinates (inverts the current camera transform) */
  const centerU = (el: HTMLElement) => { const c = center(el); const k = camRef.current; return { x: (c.x - W / 2 - k.x) / k.s + W / 2, y: (c.y - H / 2 - k.y) / k.s + H / 2 }; };
  const elZoom = (el: HTMLElement | null, s: number, dy = 0) => { if (!el) return; const c = centerU(el); zoom(s, (W / 2 - c.x) * s, (H / 2 - (c.y + dy)) * s); };
  const fmtM = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  const money = (v: number) => `$${Math.round(v)}`;

  // ---------- the script (times in seconds from the first frame after the countdown)
  const run = async (alive: () => boolean) => {
    const t0 = Date.now();
    const at = async (sec: number) => { const ms = t0 + sec * 1000 - Date.now(); if (ms > 0) await wait(ms, alive); };
    const st = () => useApp.getState();
    // 0:00 title
    setView("title"); say(null);
    await at(4);
    // 01 set up any restaurant
    setView("home"); cap("01 / 10", "Set up any restaurant"); say("Describe any restaurant in one sentence and it builds the kitchen, menu and staff.");
    await wait(400, alive);
    const ta = q("textarea") as HTMLTextAreaElement | null;
    if (ta) { ta.scrollIntoView({ block: "center" }); await moveTo(center(ta), alive); await typeInto(ta, DESCRIBE, alive); }
    await clickEl(q("button", "Fill from description"), alive);
    await until(() => !q("button", "Reading…") && !!q("aside, main, form, div", "taco"), 4000, alive);
    const menuHdr = q("h3", "Menu"); if (menuHdr) { menuHdr.scrollIntoView({ block: "start" }); elZoom(menuHdr, 1.15); }
    await at(12);
    // 02 past orders
    cap("02 / 10", "Past orders"); say("Import past orders from Square, Toast or DoorDash to calibrate it.");
    zoom(1, 0, 0);
    const past = q("h3", "Past orders"); if (past) past.scrollIntoView({ block: "center" });
    const fileInput = q('input[type="file"]') as HTMLInputElement | null;
    const importBtn = q("button", "Choose") ?? q("button", "Import") ?? q("label", "CSV");
    if (importBtn) await moveTo(center(importBtn), alive);
    if (fileInput) {
      try {
        const csv = await (await fetch("/sample-orders.csv")).text();
        const dt = new DataTransfer(); dt.items.add(new File([csv], "sample-orders.csv", { type: "text/csv" }));
        fileInput.files = dt.files; fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      } catch { /* ignore */ }
      await until(() => !!q("*", "orders") && !!(q("div", "Friday") || q("div", "orders")), 4000, alive);
      const sum = q("h3", "Past orders"); if (sum) elZoom(sum, 1.2);
    }
    await at(16);
    // 03 real restaurant
    cap("03 / 10", "Real restaurant"); say("For this demo, the original Primanti Bros. in the Strip District.");
    zoom(1, 0, 0);
    window.scrollTo(0, 0); stageRef.current?.querySelector("main")?.scrollIntoView({ block: "start" });
    const card = q("a", "Primanti") ?? q("div", "Primanti");
    if (card) { await moveTo(center(card), alive); setCursor(c => ({ ...c, ripple: c.ripple + 1 })); await wait(150, alive); }
    setView("app"); st().setTab("Tonight");
    await at(20);
    // 04 kitchen customizer
    cap("04 / 10", "Kitchen customizer"); say("Every station, cook and dish is editable, down to prep times.");
    st().setTab("Kitchen"); await wait(300, alive);
    const aside = q("aside:last-of-type");
    if (aside) { elZoom(aside, 1.25); await wait(600, alive); const eq = q("aside:last-of-type h3", "Equipment") ?? aside; await moveTo(center(eq), alive, 450); await wait(600, alive); const staff = q("aside:last-of-type h3", "Staff"); if (staff) { staff.scrollIntoView({ block: "center" }); await moveTo(center(staff), alive, 450); } await wait(600, alive); const menu = q("aside:last-of-type h3", "Menu"); if (menu) { menu.scrollIntoView({ block: "center" }); await moveTo(center(menu), alive, 500); } }
    await at(25);
    // 05 any night
    cap("05 / 10", "Any night, real inputs"); say("Pick any date. Real events and weather set the demand.");
    zoom(1, 0, 0); st().setTab("Tonight"); await wait(300, alive);
    { const nb = q("button", "Next game day"); if (nb) { await moveTo(center(nb), alive); setCursor(c => ({ ...c, ripple: c.ripple + 1 })); await wait(200, alive); } }
    await until(() => st().date === DEMO_DATE && !!st().night, 4000, alive);
    const pitt = q("aside:first-of-type button", "Pittsburgh Panthers") ?? q("aside:first-of-type *", "Florida State");
    if (pitt) { pitt.scrollIntoView({ block: "center" }); elZoom(pitt, 1.35); await moveTo(center(pitt), alive); }
    await wait(1200, alive);
    const chart = q("aside:first-of-type svg"); if (chart) { chart.scrollIntoView({ block: "center" }); elZoom(chart, 1.35); }
    await at(31);
    // 06 live simulation
    cap("06 / 10", "Live simulation"); say("It plays the whole night forward in 2D or 3D.");
    zoom(1, 0, 0); st().setTab("Watch"); st().setView("2d"); st().reset(); st().setSpeed(720); st().seekTime(18 * 60 + 15); await wait(300, alive);
    await clickEl(q("button", "720×"), alive);
    await clickEl(q("button", "Play"), alive);
    await until(() => (st().night ? snapshotAt(st().night, st().tIdx)?.t ?? 0 : 0) >= 18 * 60 + 45, 6000, alive);
    st().setView("3d");
    await until(() => (st().night ? snapshotAt(st().night, st().tIdx)?.t ?? 0 : 0) >= 19 * 60 + 15, 6000, alive);
    st().pause();
    const snap = st().night ? snapshotAt(st().night, st().tIdx) : null;
    const w = snap?.live.avgDasherWait ?? 0;
    say(`By 7:15 PM the fryer falls behind and Dashers wait ${fmtM(w)} minutes.`);
    const canvasEl = q("canvas"); if (canvasEl) elZoom(canvasEl, 1.3, -90);
    await wait(1500, alive);
    if (canvasEl) { const c = centerU(canvasEl); zoom(1.3, (W / 2 - (c.x + 120)) * 1.3, (H / 2 - (c.y + 160)) * 1.3, 700); }
    st().play(); await wait(1800, alive); st().pause();
    await at(43);
    // 07 root cause
    zoom(1, 0, 0); cap("07 / 10", "Root-cause finder"); st().setTab("Why"); await wait(300, alive);
    const a = st().attribution; const top = a ? [...a.shares].sort((x, y) => y.value - x.value)[0] : null;
    const total = a ? a.shares.reduce((s, x) => s + Math.max(0, x.value), 0) : 1;
    say("It reruns the night without each cause.");
    const row = top ? q("aside:last-of-type button", top.label) ?? q("aside:last-of-type *", top.label) : null;
    if (row) { elZoom(row, 1.25); await clickEl(row, alive); }
    await wait(1200, alive);
    if (top) say(`${top.label} explains ${Math.round(Math.max(0, top.value) / (total || 1) * 100)}% of the delay.`);
    await at(49);
    // 08 rehearse
    zoom(1, 0, 0); cap("08 / 10", "Rehearse"); say("An AI suggests fixes and each one is tested on 300 nights.");
    st().setTab("Rehearse"); await wait(300, alive);
    const rb = q("button", "Rehearse tonight"); if (rb) await clickEl(rb, alive); else await moveTo(center(q("aside:last-of-type")!), alive);
    await until(() => !!st().plan, 15000, alive);
    const ev = st().plan?.combinedEvidence;
    const fixes = q("aside:last-of-type *", "Tested fixes") ?? q("aside:last-of-type");
    if (fixes) { fixes.scrollIntoView({ block: "start" }); elZoom(fixes, 1.2); }
    await wait(1000, alive);
    const rej = q("aside:last-of-type button", "rejected"); if (rej) { await clickEl(rej, alive); await wait(300, alive); const crossed = q("aside:last-of-type s") ?? q("aside:last-of-type .line-through"); if (crossed) { crossed.scrollIntoView({ block: "center" }); await moveTo(center(crossed), alive); } }
    if (ev) say(`Only fixes that pay off make the plan. It costs ${money(ev.cost)} and protects ${money(ev.protectedDollars)}.`);
    await at(59);
    // 09 race
    zoom(1, 0, 0); cap("09 / 10", "Race");
    const b = ev?.before.avgDasherWait ?? 0, af = ev?.after.avgDasherWait ?? 0;
    say(`Same night, with the plan. Dasher wait drops from ${fmtM(b)} to ${fmtM(af)} minutes.`);
    st().setTab("Race"); await wait(300, alive);
    st().seekTime(SERVICE_START + 60 * 4 + 45); st().setSpeed(720); st().play();
    await wait(2600, alive);
    st().seekTime(21 * 60 + 52); await wait(1500, alive);
    await at(65);
    // 10 ask anything
    zoom(1, 0, 0); cap("10 / 10", "Ask anything"); say("Ask anything and watch it play out in the kitchen.");
    st().pause(); st().setTab("Ask"); await wait(300, alive);
    const input = q("#ask-input") as HTMLInputElement | null;
    if (input) { await moveTo(center(input), alive); await typeInto(input, ASK_Q, alive); }
    // run the same pipeline the Ask panel uses, minus the recovery-plan pass (kept short and deterministic for the recording)
    useApp.setState({ askLoading: true, askStatus: "Running the experiment…", askResult: null, askNight: null, viewportSource: "tonight", playing: false });
    try { const r = await runAskPipeline(ASK_Q, st().tonight, { recovery: false, llmTimeoutMs: 6000 }); useApp.setState({ askResult: r, askLoading: false, askStatus: "" }); } catch { useApp.setState({ askLoading: false, askStatus: "" }); }
    await until(() => !!st().askResult && !st().askLoading, 12000, alive);
    await clickEl(q("button", "Show in kitchen"), alive);
    await until(() => st().viewportSource === "ask" && !!st().askNight, 8000, alive);
    st().setView("2d"); st().seekTime(17 * 60 + 56); st().setSpeed(240); st().play();
    const canvas2 = q("section svg") ?? q("section"); if (canvas2) elZoom(canvas2, 1.25);
    await wait(1800, alive); st().pause();
    zoom(1, 0, 0);
    await at(74);
    // game plan
    say("Every plan ends with a prep list, a staff message and prep times for DoorDash.");
    useApp.setState({ viewportSource: "tonight" }); st().setTab("Rehearse"); await wait(300, alive);
    const gp = q("aside:last-of-type *", "game plan");
    const asideEl = q("aside:last-of-type");
    if (gp && asideEl) { const target = gp.offsetTop - 40; const startTop = asideEl.scrollTop; const t1 = Date.now(); while (Date.now() - t1 < 1400) { const u = Math.min(1, (Date.now() - t1) / 1400); const e = 1 - Math.pow(1 - u, 3); asideEl.scrollTop = startTop + (target + 500 - startTop) * e; await wait(16, alive); } }
    await at(78);
    // end card
    say(null); setChapter(null); setView("end");
    await at(80);
  };

  useEffect(() => { if (phase !== "playing") return; const t = setInterval(() => setElapsed(e => e + 1), 1000); setElapsed(0); return () => clearInterval(t); }, [phase]);

  const showApp = view === "app";
  const showHome = view === "home";
  return (
    <div className="fixed inset-0 bg-white overflow-hidden" style={{ cursor: phase === "pre" ? "auto" : "none" }}>
      <div ref={stageRef} className="absolute" style={{ width: W, height: H, left: "50%", top: "50%", transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center", overflow: "hidden", background: "#F3F4F6" }}>
        {/* camera layer */}
        <div style={{ width: W, height: H, transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`, transformOrigin: "center", transition: `transform ${cam.ms}ms cubic-bezier(.4,0,.2,1)` }}>
          <div style={{ position: "absolute", inset: 0, overflow: "auto", visibility: showHome ? "visible" : "hidden", pointerEvents: showHome ? "auto" : "none" }}><Home /></div>
          <div style={{ position: "absolute", inset: 0, visibility: showApp ? "visible" : "hidden", pointerEvents: showApp ? "auto" : "none" }}><App demoRestaurant={RESTAURANT} /></div>
        </div>
        {(view === "title" || view === "end") && (
          <div className="absolute inset-0 bg-white flex flex-col items-center justify-center">
            <div className="text-[96px] font-semibold tracking-tight text-fg">Rush Rehearsal</div>
            {view === "title" ? <div className="text-[34px] text-fg-2 mt-2">Rehearse your rush before it happens</div> : <div className="num text-[30px] text-fg-2 mt-3">rushhour-psi.vercel.app</div>}
          </div>
        )}
        {/* chapter label */}
        {chapter && phase === "playing" && (
          <div key={chapter.n} className="absolute left-8 top-8 bg-white border border-[#DADDE2] rounded-[6px] px-5 py-3 flex items-baseline gap-4" style={{ animation: "demoFadeIn 150ms ease-out" }}>
            <span className="num text-[20px] text-fg-2">{chapter.n}</span><span className="text-[24px] font-medium text-fg">{chapter.name}</span>
          </div>
        )}
        {/* caption */}
        {caption && phase === "playing" && (
          <div key={capKey} className="absolute left-1/2 -translate-x-1/2 bottom-[120px] max-w-[1400px] bg-white border border-[#DADDE2] rounded-[6px] px-10 py-5 text-[32px] leading-snug text-fg text-center" style={{ boxShadow: "0 8px 28px rgba(22,25,29,.12)", animation: "demoFade 200ms ease-out" }}>
            {caption.split(/(\d[\d.,$%]*)/).map((part, i) => (/^\d[\d.,$%]*$/.test(part) ? <span key={i} className="num">{part}</span> : <span key={i}>{part}</span>))}
          </div>
        )}
        {/* fake cursor */}
        {cursor.visible && phase === "playing" && (
          <div className="absolute pointer-events-none" style={{ left: cursor.x, top: cursor.y, zIndex: 50 }}>
            <div key={cursor.ripple} className="absolute rounded-full border-2 border-[#1D5FA8]" style={{ width: 36, height: 36, left: -18, top: -18, animation: cursor.ripple ? "demoRipple 450ms ease-out forwards" : "none", opacity: 0 }} />
            <svg width="26" height="30" viewBox="0 0 26 30" style={{ marginLeft: -2, marginTop: -2, filter: "drop-shadow(0 1px 2px rgba(0,0,0,.35))" }}><path d="M2 2 L2 23 L8 17.5 L12 27 L16.5 25 L12.5 16 L21 16 Z" fill="#16191D" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
          </div>
        )}
        {phase === "countdown" && (
          <div className="absolute inset-0 bg-white flex items-center justify-center"><div className="num text-[160px] text-fg">{count}</div></div>
        )}
        {paused && phase === "playing" && <div className="absolute right-8 top-8 num text-[18px] text-fg-3">paused</div>}
      </div>
      {phase === "pre" && (
        <div className="absolute inset-0 bg-white flex flex-col items-center justify-center gap-5 text-center">
          <div className="text-[36px] font-semibold text-fg">Demo recording</div>
          <div className="text-[18px] text-fg-2 max-w-[640px]">Press F11 for full screen, start your recorder, then press Start or the space bar.</div>
          <div className="text-[14px] text-fg-3">{warm ? "Everything is pre-loaded." : "Pre-loading the restaurant, the night, the plan and the answers…"}</div>
          <button className="btn btn-primary text-[16px] px-6 py-2.5" onClick={() => void start()} disabled={!warm}>Start</button>
          <div className="text-[13px] text-fg-3">During playback: Space pauses, R restarts, Esc exits.</div>
        </div>
      )}
      {phase === "done" && <div className="absolute right-6 bottom-4 text-[13px] text-fg-3">Done in {elapsed}s. R to restart, Esc to exit.</div>}
      <style>{`@keyframes demoFade{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}} @keyframes demoFadeIn{from{opacity:0}to{opacity:1}} @keyframes demoRipple{from{opacity:.9;transform:scale(.3)}to{opacity:0;transform:scale(1.2)}}`}</style>
    </div>
  );
}
