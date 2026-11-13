import type { Metadata } from "next";
import { Suspense } from "react";
import { GraphContent } from "@/client/views/graph";

export const metadata: Metadata = { title: "깃 그래프 · Agent Control" };

export default function GraphPage({ searchParams }: PageProps<"/graph">) {
  return (
    <div className="mx-auto max-w-[1600px] px-5 pt-8 md:px-10">
      <Suspense fallback={<p className="text-[14px] text-muted">불러오는 중…</p>}>
        <GraphContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
