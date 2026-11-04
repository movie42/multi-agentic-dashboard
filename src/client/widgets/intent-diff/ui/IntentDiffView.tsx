"use client";

import { useContext, useState } from "react";
import type { FlowData, IntentDiffResult, ItemFlow, MechanicalReason, PlanItemView } from "@/lib/intentDiff/types";
import { useStoredList } from "@/client/shared/lib/useStoredList";
import { SymbolClick, type SymbolTarget } from "./CodeLines";
import { FeatureMapView } from "./FeatureMapView";
import { HunkBlock } from "./HunkBlock";
import { FlowView, stepAnchor } from "./FlowView";
import { HunkLookup, type HunkEntry } from "@/client/entities/intent-diff";
import { AskPlanItem } from "@/client/features/ask-about-diff";
import { SymbolPanel } from "./SymbolPanel";
import { AskBoardContext, useAskBoard } from "@/client/features/ask-about-diff";
import { useIntentDiff, type IntentDiffQuery } from "@/client/entities/intent-diff";

const MECHANICAL_LABEL: Record<MechanicalReason, string> = {
  whitespace: "공백만",
  imports: "import 줄만",
  rename: "이름만",
  lockfile: "잠금 파일",
  taskDoc: "작업 문서",
};

type ReadingMode = "plan" | "feature";

const MODE_OPTIONS: { key: ReadingMode; label: string }[] = [
  { key: "plan", label: "계획 순서" },
  { key: "feature", label: "기능 지도" },
];

interface IntentDiffViewProps {
  query: IntentDiffQuery;
}

export function IntentDiffView({ query }: IntentDiffViewProps) {
  const { state, reload } = useIntentDiff(query);
  const result = state.result;

  return (
    <div className="flex flex-col gap-8">
      {state.status === "error" && (
        <p className="rounded-lg bg-tint px-4 py-3 text-[14px]">
          <span className="mr-2 font-semibold text-accent">불러오기 실패</span>
          {state.error}
        </p>
      )}
      {!result ? (
        <p className="text-[14px] text-muted">변경과 세션 기록을 읽는 중이에요…</p>
      ) : (
        <Loaded result={result} loading={state.status === "loading"} onReload={reload} />
      )}
    </div>
  );
}

interface LoadedProps {
  result: IntentDiffResult;
  loading: boolean;
  onReload: () => void;
}

function Loaded({ result, loading, onReload }: LoadedProps) {
  const lookup = new Map<string, HunkEntry>();
  for (const file of result.files) {
    for (const hunk of file.hunks) lookup.set(hunk.id, { file, hunk, node: result.featureMap.files[file.file] ?? null });
  }
  const { range, stats } = result;
  const name = range.worktreePath.split("/").pop();
  const [storedMode, writeMode] = useStoredList("agent-control:diff-mode");
  const mode: ReadingMode = storedMode[0] === "feature" ? "feature" : "plan";
  const [symbol, setSymbol] = useState<SymbolTarget | null>(null);
  const askBoard = useAskBoard(range.worktreePath, result);

  return (
    <HunkLookup.Provider value={lookup}>
      <AskBoardContext.Provider value={askBoard}>
      <SymbolClick.Provider value={setSymbol}>
        <header>
          <h1 className="text-[30px] leading-[1.2] font-bold tracking-[-0.02em]">{result.plan?.title ?? name}</h1>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted">
            <span className="font-mono">{range.branch ?? name}</span>
            <span>
              {range.baseLabel} <span className="font-mono">{range.base.slice(0, 7)}</span> →{" "}
              {range.head ? <span className="font-mono">{range.head.slice(0, 7)}</span> : "지금 워크트리"}
            </span>
            <span>
              세션 {result.sessionCount} · 상태 기록 {result.snapshotCount}
              {result.archivedCount > 0 && ` · 보관 기록 ${result.archivedCount}`}
            </span>
            <button type="button" onClick={onReload} disabled={loading} className="underline decoration-faint underline-offset-[3px] hover:decoration-current disabled:opacity-50">
              {loading ? "다시 읽는 중…" : "다시 읽기"}
            </button>
          </p>
          <p className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
            <Stat label="조각" value={stats.hunks} />
            <Stat label="기록으로 연결" value={stats.exact} tone="text-done" />
            <Stat label="추정으로 연결" value={stats.file} tone="text-ask" />
            <Stat label="의도 미상" value={stats.none} />
            <Stat label="기계적" value={stats.mechanical} />
          </p>
          <div className="mt-5 flex w-fit rounded-full bg-tint p-0.5 text-[13px] font-semibold">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={mode === option.key}
                onClick={() => writeMode([option.key])}
                className={`rounded-full px-3.5 py-1.5 leading-none ${mode === option.key ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <nav className="text-[13px] lg:sticky lg:top-6 lg:col-span-3 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
            {mode === "plan" ? <Toc result={result} /> : <FeatureToc result={result} />}
          </nav>
          <main className="flex min-w-0 flex-col gap-12 lg:col-span-9">
            {mode === "feature" ? (
              <FeatureMapView map={result.featureMap} />
            ) : (
              <>
                {result.plan ? (
                  result.plan.phases.map((phase) => (
                    <section key={phase.id} className="flex flex-col gap-8">
                      <h2 className="text-[20px] font-bold tracking-[-0.01em]">{phase.title}</h2>
                      {phase.items.map((item) => (
                        <PlanItemBlock key={item.id} item={item} flow={result.flow} />
                      ))}
                    </section>
                  ))
                ) : (
                  <section className="flex flex-col gap-6">
                    <h2 className="text-[20px] font-bold tracking-[-0.01em]">흐름</h2>
                    <FlowView flow={result.flow.flows["*"]} data={result.flow} />
                  </section>
                )}
                <Buckets result={result} />
              </>
            )}
          </main>
        </div>
        {symbol && <SymbolPanel worktreePath={range.worktreePath} rev={range.head} target={symbol} onClose={() => setSymbol(null)} />}
      </SymbolClick.Provider>
      </AskBoardContext.Provider>
    </HunkLookup.Provider>
  );
}

interface StatProps {
  label: string;
  value: number;
  tone?: string;
}

function Stat({ label, value, tone = "" }: StatProps) {
  return (
    <span className="rounded-full bg-tint px-2.5 py-0.5">
      <span className="text-muted">{label}</span> <span className={`font-semibold ${tone}`}>{value}</span>
    </span>
  );
}

interface PlanItemBlockProps {
  item: PlanItemView;
  flow: FlowData;
}

function PlanItemBlock({ item, flow }: PlanItemBlockProps) {
  return (
    <section id={`item-${item.id}`} className="flex scroll-mt-6 flex-col gap-4 border-t border-hair pt-5">
      <h3 className="flex flex-wrap items-baseline gap-2 text-[16px] leading-[1.45] font-semibold">
        <span className="shrink-0 font-mono text-[13px] whitespace-nowrap text-muted">{item.id}</span>
        <span>{item.title}</span>
        <span className={`text-[12px] font-normal ${item.done ? "text-done" : "text-muted"}`}>{item.done ? "완료" : "미완료"}</span>
      </h3>
      <AskPlanItem.Provider value={{ id: item.id, title: item.title }}>
        <FlowView flow={flow.flows[item.id]} data={flow} />
      </AskPlanItem.Provider>
    </section>
  );
}

interface FlowLinksProps {
  flow: ItemFlow | undefined;
  data: FlowData;
}

/** The top two levels of functions and components a flow reads, for the table of contents. */
function FlowLinks({ flow, data }: FlowLinksProps) {
  const steps = (flow?.steps ?? []).filter(
    (step) => step.kind === "own" && step.depth <= 1 && data.symbols[step.symbolId]?.kind !== "value",
  );
  return steps.map((step) => {
    const symbol = data.symbols[step.symbolId];
    return (
      <a key={step.symbolId} href={`#${stepAnchor(step.symbolId)}`} className={`block truncate py-0.5 text-muted hover:text-fg ${["pl-3", "pl-6", "pl-9", "pl-12"][Math.min(step.depth, 3)]}`}>
        {symbol.name}
      </a>
    );
  });
}

interface ResultProps {
  result: IntentDiffResult;
}

function Toc({ result }: ResultProps) {
  return (
    <div className="flex flex-col gap-4">
      {result.plan ? (
        result.plan.phases.map((phase) => (
          <div key={phase.id}>
            <p className="mb-1 font-semibold">{phase.title}</p>
            {phase.items.map((item) => (
              <div key={item.id}>
                <a href={`#item-${item.id}`} className={`flex gap-1.5 py-0.5 hover:text-fg ${item.groups.length === 0 ? "text-faint" : ""}`}>
                  <span className="shrink-0 font-mono text-[12px] whitespace-nowrap text-muted">{item.id}</span>
                  <span className="truncate">{item.title}</span>
                </a>
                <FlowLinks flow={result.flow.flows[item.id]} data={result.flow} />
              </div>
            ))}
          </div>
        ))
      ) : (
        <FlowLinks flow={result.flow.flows["*"]} data={result.flow} />
      )}
      <div className="flex flex-col gap-0.5 border-t border-hair pt-3">
        <a href="#bucket-unplanned" className={result.unplanned.length > 0 ? "font-semibold text-ask" : "text-muted"}>
          계획 밖 변경 {result.unplanned.length}
        </a>
        {result.plan && (
          <a href="#bucket-missing" className={result.missing.length > 0 ? "font-semibold text-ask" : "text-muted"}>
            계획했는데 변경 없음 {result.missing.length}
          </a>
        )}
        <a href="#bucket-mechanical" className="text-muted">
          기계적 변경 {result.mechanical.length}
        </a>
        <a href="#bucket-unknown" className="text-muted">
          의도 미상 {result.unknown.length}
        </a>
      </div>
    </div>
  );
}

function FeatureToc({ result }: ResultProps) {
  const { clusters, loose } = result.featureMap;
  return (
    <div className="flex flex-col gap-1">
      {clusters.map((cluster) => (
        <a key={cluster.id} href={`#${cluster.id}`} className="flex gap-1.5 py-0.5 hover:text-fg">
          <span className="truncate">{cluster.title}</span>
          <span className="shrink-0 text-muted">{cluster.files.length}</span>
        </a>
      ))}
      {loose.length > 0 && <p className="mt-2 border-t border-hair pt-2 text-muted">import 연결 없음 {loose.length}</p>}
    </div>
  );
}

function Buckets({ result }: ResultProps) {
  return (
    <>
      {(result.plan || result.unplanned.length > 0) && (
        <section id="bucket-unplanned" className="flex scroll-mt-6 flex-col gap-6 border-t-2 border-ask pt-5">
          <div>
            <h2 className="text-[20px] font-bold tracking-[-0.01em]">계획 밖 변경 {result.unplanned.length}</h2>
            <p className="mt-1 text-[13px] text-muted">어느 계획 항목의 작업 시간에도, 파일 목록에도 맞지 않는 변경이에요. 리뷰할 때 먼저 보세요.</p>
          </div>
          <FlowView flow={result.flow.flows.unplanned} data={result.flow} />
        </section>
      )}

      {result.plan && (
        <section id="bucket-missing" className="flex scroll-mt-6 flex-col gap-3 border-t border-hair pt-5">
          <h2 className="text-[20px] font-bold tracking-[-0.01em]">계획했는데 변경 없음 {result.missing.length}</h2>
          {result.missing.length === 0 ? (
            <p className="text-[13px] text-muted">모든 계획 항목에 변경이 연결됐어요.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-[14px]">
              {result.missing.map((item) => (
                <li key={item.id} className="flex gap-2">
                  <span className="shrink-0 font-mono text-[13px] whitespace-nowrap text-muted">{item.id}</span>
                  <span>{item.title}</span>
                  {item.sharedWith ? (
                    <a href={`#item-${item.sharedWith}`} className="text-[12px] text-muted underline decoration-faint underline-offset-[3px]">
                      같은 파일이 {item.sharedWith}에 묶여 있어요
                    </a>
                  ) : (
                    <span className={`text-[12px] ${item.done ? "text-ask" : "text-muted"}`}>{item.done ? "완료로 표시됨" : "미완료"}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Collapsed id="bucket-mechanical" title={`기계적 변경 ${result.mechanical.length}`} hint="공백, import 줄, 이름 변경, 잠금 파일, 작업 문서처럼 읽지 않아도 되는 변경이에요.">
        {result.mechanical.map((ref) => (
          <HunkRow key={ref.hunkId} hunkId={ref.hunkId} note={MECHANICAL_LABEL[ref.reason]} />
        ))}
      </Collapsed>

      <Collapsed id="bucket-unknown" title={`의도 미상 ${result.unknown.length}`} hint="이 줄을 만든 도구 호출을 세션 기록에서도, 상태 기록에서도 찾지 못했어요. 사람이 직접 고쳤거나 포매터가 바꾼 경우가 많아요.">
        {result.unknown.map((ref) => (
          <HunkRow key={ref.hunkId} hunkId={ref.hunkId} />
        ))}
      </Collapsed>
    </>
  );
}

interface CollapsedProps {
  id: string;
  title: string;
  hint: string;
  children: React.ReactNode;
}

function Collapsed({ id, title, hint, children }: CollapsedProps) {
  return (
    <details id={id} className="scroll-mt-6 border-t border-hair pt-5">
      <summary className="cursor-pointer text-[18px] font-bold tracking-[-0.01em]">{title}</summary>
      <p className="mt-1 text-[13px] text-muted">{hint}</p>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </details>
  );
}

interface HunkRowProps {
  hunkId: string;
  note?: string;
}

function HunkRow({ hunkId, note }: HunkRowProps) {
  const entry = useContext(HunkLookup).get(hunkId);
  return entry ? <HunkBlock file={entry.file} hunk={entry.hunk} precision={null} note={note} /> : null;
}
