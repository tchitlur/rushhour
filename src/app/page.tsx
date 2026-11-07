"use client";
import dynamic from "next/dynamic";

const App = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center text-fg-3 text-sm">
      Loading Rush Rehearsal…
    </div>
  ),
});

export default function Page() {
  return <App />;
}
