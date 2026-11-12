import type { Metadata } from "next";
import { Suspense } from "react";
import { DocContent } from "@/client/views/doc";

export const metadata: Metadata = { title: "문서 · Agent Control" };

export default function DocPage({ searchParams }: PageProps<"/doc">) {
  return (
    <Suspense fallback={<p className="px-5 py-10 text-[14px] text-muted">불러오는 중…</p>}>
      <DocContent searchParams={searchParams} />
    </Suspense>
  );
}
