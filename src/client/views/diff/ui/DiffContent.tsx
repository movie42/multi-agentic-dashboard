import { IntentDiffView } from "@/client/widgets/intent-diff";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) || null;
}

interface DiffContentProps {
  searchParams: SearchParams;
}

export async function DiffContent({ searchParams }: DiffContentProps) {
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
