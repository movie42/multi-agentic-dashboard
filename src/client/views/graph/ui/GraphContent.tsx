import { GitGraphView } from "@/client/widgets/git-graph";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface GraphContentProps {
  searchParams: SearchParams;
}

export async function GraphContent({ searchParams }: GraphContentProps) {
  const params = await searchParams;
  const raw = params.path;
  const worktreePath = (Array.isArray(raw) ? raw[0] : raw) || null;
  if (!worktreePath) {
    return (
      <p className="text-[14px] text-muted">
        주소에 <code>path</code>(워크트리 경로)가 없어요. 보드의 워크트리 패널에서 &apos;깃 그래프&apos;로 열어 주세요.
      </p>
    );
  }
  return <GitGraphView key={worktreePath} worktreePath={worktreePath} />;
}
