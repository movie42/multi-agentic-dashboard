"use client";

import { useState } from "react";
import { controlRun, removeRun, type RunAction } from "@/client/entities/runner";
import { toastError } from "@/client/shared/model/toastStore";
import { routesFrom, type RunState, type TemplateRun } from "@/common/templates/types";
import { cardFlags } from "./ReservedBox";
import { appendDictation, DictationButton } from "@/client/shared/ui/DictationButton";

const STATE_LABEL: Record<RunState, string> = {
  expanded: "펼침 · 시작 전",
  running: "도는 중",
  paused: "사람 확인 대기",
  done: "끝남",
  stopped: "멈춤",
};

const PILL =
  "shrink-0 rounded-full px-3 py-1 text-[12px] leading-5 font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint disabled:opacity-30";
const PRIMARY = "shrink-0 rounded-full bg-fg px-3.5 py-1 text-[12px] leading-5 font-semibold text-bg hover:opacity-85 disabled:opacity-30";

interface RunPanelProps {
  run: TemplateRun;
  focusKey: string | null;
  onEdit: (run: TemplateRun) => void;
}

export function RunPanel({ run, focusKey, onEdit }: RunPanelProps) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const current = run.cards.find((card) => card.key === run.current) ?? null;
  const stateLabel = run.state === "running" && run.hold?.reason === "check-failed" ? "확인 명령 통과 대기" : STATE_LABEL[run.state];
  const waiting = run.state === "paused" || run.hold !== null;
  const active = run.state === "running" || run.state === "paused";
  const routes = current ? routesFrom(run.routes, current.key) : [];
  const pickRoute = active && current !== null && run.hold?.reason === "no-choice" && routes.length > 0;

  const act = async (request: RunAction | "remove") => {
    setBusy(true);
    try {
      if (request === "remove") await removeRun(run.id);
      else await controlRun(run.id, request);
      if (request !== "remove" && request.action === "retry") setDraft("");
    } catch (error) {
      toastError("template-run", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted">템플릿 · {run.name}</p>
        <span className={`text-[12px] font-semibold ${waiting && active ? "text-ask" : run.state === "running" ? "text-now" : "text-muted"}`}>{stateLabel}</span>
      </div>
      {run.intent && <p className="text-[12px] whitespace-pre-wrap text-muted">이번 작업 · {run.intent}</p>}
      {run.hold && <p className="rounded-[8px] bg-ask/10 px-2.5 py-2 text-[12px] text-ask">{run.hold.text}</p>}
      <ol className="flex flex-col gap-1">
        {run.cards.map((card, index) => {
          const isCurrent = card.key === run.current;
          const visited = Boolean(run.sessions[card.key]);
          const flags = cardFlags(card);
          return (
            <li
              key={card.key}
              className={`flex items-start gap-2 rounded-[8px] px-2 py-1.5 text-[13px] ${card.key === focusKey ? "bg-tint" : ""}`}
            >
              <span
                className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                  isCurrent && active ? "animate-pulse bg-now" : visited ? "bg-fg" : "shadow-[inset_0_0_0_1.5px_var(--faint)]"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold ${visited || isCurrent ? "text-fg" : "text-muted"}`}>
                  {index + 1}. {card.title}
                  {isCurrent && active && <span className="ml-1.5 text-[11px] font-normal text-now">지금</span>}
                </p>
                {flags.length > 0 && <p className="truncate text-[11px] text-muted">{flags.join(" · ")}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        {run.state === "expanded" && (
          <button type="button" disabled={busy} onClick={() => void act({ action: "start" })} className={PRIMARY}>
            시작
          </button>
        )}
        {pickRoute &&
          routes.map((route) => (
            <button key={route.id} type="button" disabled={busy} onClick={() => void act({ action: "continue", routeId: route.id })} className={PRIMARY}>
              이 길로 · {route.label ?? run.cards.find((card) => card.key === route.to)?.title}
            </button>
          ))}
        {active && !pickRoute && (run.state === "paused" || run.hold) && (
          <button type="button" disabled={busy} onClick={() => void act({ action: "continue" })} className={PRIMARY}>
            {run.hold?.reason === "check-failed" ? "그래도 계속" : "계속"}
          </button>
        )}
        {(active || run.state === "expanded") && (
          <button type="button" onClick={() => onEdit(run)} className={PILL}>
            카드 · 선 고치기
          </button>
        )}
        {active && (
          <button type="button" disabled={busy} onClick={() => void act({ action: "stop" })} className={PILL}>
            멈추기
          </button>
        )}
        {!active && (
          <button type="button" disabled={busy} onClick={() => void act("remove")} className={`${PILL} text-accent`}>
            치우기
          </button>
        )}
      </div>
      {active && current && run.hold?.reason !== "exited" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-1.5">
            <textarea
              rows={2}
              value={draft}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)}
              placeholder={`고쳐서 다시 · '${current.title}' 카드 세션에 보낼 말`}
              className="min-w-0 flex-1 resize-y rounded-[8px] bg-tint px-2.5 py-2 text-[13px] outline-none placeholder:text-muted"
            />
            <DictationButton onText={(text) => setDraft(appendDictation(draft, text))} />
          </div>
          <button type="button" disabled={busy || !draft.trim()} onClick={() => void act({ action: "retry", text: draft })} className={`${PILL} self-start`}>
            고쳐서 다시
          </button>
        </div>
      )}
    </section>
  );
}
