"use client";

import { useContext, useState } from "react";
import type { FlowData, FlowStep, FlowSymbol, ItemFlow, SymbolKind } from "@/lib/intentDiff/types";
import { CodeLines } from "./CodeLines";
import { HunkBlock } from "./HunkBlock";
import { HunkLookup } from "./hunkLookup";

const INDENT = ["pl-0", "pl-5", "pl-10", "pl-15", "pl-20", "pl-25", "pl-30"];

const KIND_LABEL: Record<SymbolKind, string> = {
  component: "컴포넌트",
  function: "함수",
  value: "값",
  type: "타입",
};

export function stepAnchor(symbolId: string): string {
  return `step-${symbolId.replace(/[^\w-]/g, "_")}`;
}

function baseName(file: string): string {
  return file.split("/").pop() ?? file;
}

function dirName(file: string): string {
  const index = file.lastIndexOf("/");
  return index >= 0 ? file.slice(0, index + 1) : "";
}

interface SymbolHeaderProps {
  symbol: FlowSymbol;
  number: number | null;
}

function SymbolHeader({ symbol, number }: SymbolHeaderProps) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 bg-tint px-3 py-2">
      {number !== null && <span className="text-[12px] font-bold text-muted">{number}</span>}
      <span className="text-[14px] font-semibold">{symbol.name}</span>
      <span className="text-[11px] text-muted">{KIND_LABEL[symbol.kind]}</span>
      <span className="font-mono text-[12px]">
        <span className="text-muted">{dirName(symbol.file)}</span>
        {baseName(symbol.file)}
        <span className="text-faint">:{symbol.startLine}</span>
      </span>
    </div>
  );
}

interface ViaProps {
  via: FlowStep["via"];
}

function Via({ via }: ViaProps) {
  if (!via) return null;
  return (
    <div className="flex items-stretch gap-2 py-1 pl-4">
      <span className="w-px bg-faint" />
      <span className="min-w-0 truncate py-0.5 font-mono text-[11px] text-muted" title={via.text}>
        {via.text} <span className="text-faint">:{via.line}</span>
      </span>
    </div>
  );
}

interface CompactStepProps {
  step: FlowStep;
  symbol: FlowSymbol;
  label: React.ReactNode;
}

function CompactStep({ step, symbol, label }: CompactStepProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Via via={step.via} />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1 text-left text-[13px] hover:bg-tint"
      >
        <span className="w-3 text-[11px] text-muted">{open ? "▾" : "▸"}</span>
        {label}
        <span className="font-mono text-[12px] text-muted">{baseName(symbol.file)}</span>
      </button>
      {open && (
        <div className="mt-1 mb-3 overflow-hidden rounded-lg border border-hair" data-file={symbol.file}>
          <CodeLines file={symbol.file} lines={symbol.lines} />
        </div>
      )}
    </div>
  );
}

interface StepViewProps {
  step: FlowStep;
  symbol: FlowSymbol;
  number: number | null;
}

function StepView({ step, symbol, number }: StepViewProps) {
  if (step.kind === "repeat") {
    return (
      <div>
        <Via via={step.via} />
        <a href={`#${stepAnchor(symbol.id)}`} className="block px-2 py-1 text-[13px] text-muted hover:text-fg">
          ↑ 위에서 읽은 <span className="font-semibold">{symbol.name}</span>
        </a>
      </div>
    );
  }
  if (step.kind === "foreign") {
    const owner = symbol.owner;
    return (
      <CompactStep
        step={step}
        symbol={symbol}
        label={
          <>
            <span>→</span>
            {owner?.kind === "item" ? (
              <a href={`#item-${owner.id}`} onClick={(event) => event.stopPropagation()} className="font-mono text-[12px] text-muted underline decoration-faint underline-offset-[3px]">
                {owner.id}
              </a>
            ) : (
              <span className="text-[12px] text-muted">{owner?.label ?? "다른 곳"}</span>
            )}
            <span>에서 만든</span>
            <span className="font-semibold">{symbol.name}</span>
          </>
        }
      />
    );
  }
  if (symbol.kind === "value") {
    return <CompactStep step={step} symbol={symbol} label={<><span className="text-[11px] text-muted">값</span><span className="font-semibold">{symbol.name}</span></>} />;
  }
  return (
    <div id={stepAnchor(symbol.id)} className="scroll-mt-6">
      <Via via={step.via} />
      <article className="overflow-hidden rounded-lg border border-hair" data-file={symbol.file}>
        <SymbolHeader symbol={symbol} number={number} />
        {symbol.intents.length > 0 && (
          <p className="border-t border-hair px-3 py-1 text-[12px] text-muted">의도 · {symbol.intents.join(" / ")}</p>
        )}
        <CodeLines file={symbol.file} lines={symbol.lines} />
      </article>
    </div>
  );
}

interface FlowViewProps {
  flow: ItemFlow | undefined;
  data: FlowData;
}

export function FlowView({ flow, data }: FlowViewProps) {
  const lookup = useContext(HunkLookup);
  if (!flow || (flow.steps.length === 0 && flow.types.length === 0 && flow.rest.length === 0)) {
    return <p className="text-[13px] text-muted">이 항목에 연결된 변경이 없어요. 아래 &apos;계획했는데 변경 없음&apos;에서 이유를 볼 수 있어요.</p>;
  }
  let counter = 0;
  return (
    <div className="flex flex-col gap-1">
      {flow.steps.map((step, index) => {
        const symbol = data.symbols[step.symbolId];
        if (!symbol) return null;
        const numbered = step.kind === "own" && symbol.kind !== "value";
        const number = numbered ? ++counter : null;
        return (
          <div key={`${step.symbolId}-${index}`} className={INDENT[Math.min(step.depth, INDENT.length - 1)]}>
            <StepView step={step} symbol={symbol} number={number} />
          </div>
        );
      })}

      {flow.types.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] text-muted hover:text-fg">함께 바뀐 타입 {flow.types.length}</summary>
          <div className="mt-2 flex flex-col gap-3">
            {flow.types.map((id) => {
              const symbol = data.symbols[id];
              return symbol ? (
                <article key={id} className="overflow-hidden rounded-lg border border-hair" data-file={symbol.file}>
                  <SymbolHeader symbol={symbol} number={null} />
                  <CodeLines file={symbol.file} lines={symbol.lines} />
                </article>
              ) : null;
            })}
          </div>
        </details>
      )}

      {flow.rest.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[13px] text-muted hover:text-fg">
            그 밖의 변경 {flow.rest.length} · import, 설정, 함수 밖 코드
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {flow.rest.map((ref) => {
              const entry = lookup.get(ref.hunkId);
              return entry ? (
                <div key={ref.hunkId} data-file={entry.file.file}>
                  <HunkBlock file={entry.file} hunk={entry.hunk} precision={ref.precision} links={entry.node} />
                </div>
              ) : null;
            })}
          </div>
        </details>
      )}
    </div>
  );
}
