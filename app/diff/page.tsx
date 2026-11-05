import type { Metadata } from "next";
import { Suspense } from "react";
import { DiffContent } from "@/client/views/diff";

export const metadata: Metadata = { title: "변경 읽기 · Agent Control" };

export default function DiffPage({ searchParams }: PageProps<"/diff">) {
  return (
    <div className="mx-auto max-w-[1600px] px-5 pt-10 pb-36 md:px-12">
      <Suspense fallback={<p className="text-[14px] text-muted">불러오는 중…</p>}>
        <DiffContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
