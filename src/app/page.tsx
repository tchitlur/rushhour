"use client";
// Homepage = restaurant setup. /?demo=1 or pressing D opens the Primanti Bros. demo (/app?r=primanti).
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PresetCards, SavedList } from "@/components/setup/PresetCards";
import SetupForm from "@/components/setup/SetupForm";

function Home() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    if (params.get("demo") === "1") router.replace("/app?r=primanti");
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (e.key.toLowerCase() === "d") router.push("/app?r=primanti");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [params, router]);

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <header className="h-11 border-b border-line bg-bg-2 flex items-center px-6 justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[14px]">Rush Rehearsal</span>
          <span className="sub">Pittsburgh</span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-fg-2">
          <span>Press <kbd className="num text-fg bg-bg-3 border border-line rounded px-1.5">D</kbd> for the demo</span>
          <a href="/app?r=primanti" className="btn !py-1 !px-2.5 text-xs">Open the demo</a>
        </div>
      </header>

      <main className="max-w-[1180px] mx-auto px-6 pt-12 pb-16 flex flex-col gap-10">
        <section className="flex flex-col gap-2">
          <h1 className="text-[34px] leading-[1.15] font-semibold tracking-[-0.01em]">Rehearse your restaurant&apos;s rush.</h1>
          <p className="text-[15px] text-fg-2">AI proposes. The simulator proves.</p>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold text-fg-2 uppercase tracking-wide">Start from an example</h2>
            <span className="sub">Fictional Pittsburgh restaurants; tonight&apos;s events and weather are real.</span>
          </div>
          <PresetCards />
        </section>

        <SavedList />

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold text-fg-2 uppercase tracking-wide">Set up your own</h2>
            <span className="sub">Pick a cuisine template, then adjust. You can edit every station, cook and menu item later in the Kitchen tab.</span>
          </div>
          <SetupForm />
        </section>
      </main>
    </div>
  );
}

export default function Page() { return <Suspense><Home /></Suspense>; }
