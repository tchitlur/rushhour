"use client";
// Homepage = restaurant setup (subagent A replaces this). Placeholder keeps the site working: /?demo=1 or D opens Maria's demo.
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function Home() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    if (params.get("demo") === "1") router.replace("/app?r=maria");
    const onKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "d") router.push("/app?r=maria"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [params, router]);
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <h1 className="text-[28px] font-semibold">Rehearse your restaurant&apos;s rush.</h1>
      <a href="/app?r=maria" className="btn btn-primary">Open Maria&apos;s demo</a>
    </div>
  );
}
export default function Page() { return <Suspense><Home /></Suspense>; }
