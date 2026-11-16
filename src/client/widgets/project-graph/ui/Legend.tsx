import type { EdgeKind } from "../model/graph";
import { EDGE_STYLE } from "./GraphEdges";

const AGENT_LINES: EdgeKind[] = ["delegate", "report", "next", "route"];
const WORKTREE_LINES: EdgeKind[] = ["fork", "overlap"];
const LEGEND_LABEL: Record<EdgeKind, string> = { delegate: "맡김", report: "보고", next: "끝나면 다음", fork: "갈라짐", overlap: "같은 파일 (상자를 고르면 진하게)", route: "템플릿 다음 카드" };

/** What each line means, pinned to the bottom-left of the canvas. */
interface LegendProps {
  showWorktreeLines: boolean;
}

export function Legend({ showWorktreeLines }: LegendProps) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] bg-bg/90 px-3 py-2 text-[12px] text-muted shadow-[inset_0_0_0_1px_var(--hair)]">
      {(showWorktreeLines ? [...AGENT_LINES, ...WORKTREE_LINES] : AGENT_LINES).map((kind) => {
        const style = EDGE_STYLE[kind];
        return (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <svg aria-hidden width={28} height={8} viewBox="0 0 28 8">
              <path d="M1 4 H22" fill="none" strokeWidth={1.6} strokeDasharray={style.dash} className={style.stroke} />
              {style.marker && <path d="M21 1 L27 4 L21 7 z" className={style.stroke.replace("stroke-", "fill-")} />}
            </svg>
            {LEGEND_LABEL[kind]}
          </span>
        );
      })}
    </div>
  );
}
