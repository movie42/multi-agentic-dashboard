import type { Metadata } from "next";
import { Suspense } from "react";
import { IntentDiffView } from "@/features/intentDiff/IntentDiffView";

export const metadata: Metadata = { title: "변경 읽기 · Agent Control" };

type SearchParams = PageProps<"/diff">["searchParams"];

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) || null;
}

interface DiffContentProps {
  searchParams: SearchParams;
}

async function DiffContent({ searchParams }: DiffContentProps) {
  const params = await searchParams;
  const worktreePath = first(params.path);
  if (!worktreePath) {
    return (
      <p className="text-[14px] text-muted">
        주소에 <code>path</code>(워크트리 경로)가 없어요. 보드의 워크트리 패널에서 &apos;변경 읽기&apos;로 열어 주세요.
      </p>
    );
  }
  return (
    <IntentDiffView query={{ worktreePath, base: first(params.base), head: first(params.head), task: first(params.task) }} />
  );
}

export default function DiffPage({ searchParams }: PageProps<"/diff">) {
  return (
    <div className="mx-auto max-w-[1600px] px-5 pt-10 pb-36 md:px-12">
      <Suspense fallback={<p className="text-[14px] text-muted">불러오는 중…</p>}>
        <DiffContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
