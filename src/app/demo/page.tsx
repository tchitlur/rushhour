"use client";
import dynamic from "next/dynamic";

const DemoStage = dynamic(() => import("@/components/demo/DemoStage"), { ssr: false, loading: () => <div className="h-full w-full bg-white" /> });

export default function DemoPage() {
  return <DemoStage />;
}
