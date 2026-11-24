import type { Metadata } from "next";
import { Suspense } from "react";
import { SessionWindow } from "@/client/views/session";

export const metadata: Metadata = { title: "세션 · Agent Control" };

async function SessionEntry({ searchParams }: Pick<PageProps<"/session">, "searchParams">) {
  const { id } = await searchParams;
  return <SessionWindow agentIds={typeof id === "string" ? [id] : (id ?? [])} />;
}

export default function SessionPage({ searchParams }: PageProps<"/session">) {
  return (
    <Suspense fallback={<p className="px-5 py-10 text-center text-[14px] text-muted">세션을 불러오는 중…</p>}>
      <SessionEntry searchParams={searchParams} />
    </Suspense>
  );
}
