"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { editRun, removeTemplate, saveTemplate, templateKeys } from "@/client/entities/runner";
import { toastError } from "@/client/shared/model/toastStore";
import { EFFORT_CHOICES, MODEL_CHOICES } from "@/common/actions/schema";
import { BUILTIN_TEMPLATE_PREFIX, type TemplateCard, type TemplateRoute, type TemplateRun, type WorkflowTemplate } from "@/common/templates/types";
import {
  addCard,
  addRoute,
  moveCard,
  removeCard,
  removeRoute,
  setKind,
  setNext,
  templateProblems,
  updateCard,
  updateRoute,
} from "../model/editTemplate";
import { appendDictation, DictationButton } from "@/client/shared/ui/DictationButton";

const INPUT = "rounded-[8px] bg-tint px-2.5 py-1.5 text-[13px] text-fg outline-none placeholder:text-muted";
const PILL =
  "shrink-0 rounded-full px-3 py-1 text-[12px] leading-5 font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint disabled:opacity-30";
const CHOICE =
  "rounded-full px-3 py-1 text-[12px] leading-none font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint aria-pressed:bg-fg aria-pressed:text-bg";

interface TemplateEditorProps {
  initial: WorkflowTemplate;
  isNew: boolean;
  /** Edits this expanded run instead of the saved template; cards that already have a session cannot be removed. */
  run?: TemplateRun;
  onClose: () => void;
}

interface RouteFieldsProps {
  template: WorkflowTemplate;
  route: TemplateRoute;
  onChange: (template: WorkflowTemplate) => void;
}

/** The same line kinds the canvas draws between sessions; what a next line hands over is editable. */
export function RouteFields({ template, route, onChange }: RouteFieldsProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        <button type="button" aria-pressed={route.kind === "next"} onClick={() => onChange(updateRoute(template, route.id, { kind: "next" }))} className={CHOICE} title="뒤 카드에 넘길 말을 보내요 · 비우면 앞 카드의 마지막 답">
          끝나면 다음
        </button>
        <button type="button" aria-pressed={route.kind === "report"} onClick={() => onChange(updateRoute(template, route.id, { kind: "report" }))} className={CHOICE} title="앞 카드의 마지막 답을 그대로 보내요">
          끝나면 보고
        </button>
      </div>
      {route.kind === "next" && (
        <textarea
          rows={2}
          value={route.prompt ?? ""}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(updateRoute(template, route.id, { prompt: event.target.value.trim() ? event.target.value : null }))}
          placeholder="뒤 카드에 넘길 말 · 비우면 앞 카드의 마지막 답을 넣어요"
          className={`${INPUT} resize-y`}
        />
      )}
    </div>
  );
}

interface CardEditorProps {
  template: WorkflowTemplate;
  card: TemplateCard;
  index: number;
  /** Already has a session in the run being edited. */
  locked: boolean;
  onChange: (template: WorkflowTemplate) => void;
}

function CardEditor({ template, card, index, locked, onChange }: CardEditorProps) {
  const others = template.cards.filter((item) => item.key !== card.key);
  const routes = template.routes.filter((route) => route.from === card.key);
  const afterJudge = template.routes.some((route) => route.to === card.key && template.cards.find((item) => item.key === route.from)?.kind === "judge");
  const patch = (value: Partial<Omit<TemplateCard, "key">>) => onChange(updateCard(template, card.key, value));
  return (
    <li className="flex flex-col gap-2 rounded-[10px] p-3 shadow-[inset_0_0_0_1px_var(--hair)]">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-muted">{index + 1}</span>
        <input value={card.title} onChange={(event: React.ChangeEvent<HTMLInputElement>) => patch({ title: event.target.value })} className={`${INPUT} min-w-0 flex-1 font-semibold`} />
        <div className="flex gap-1">
          <button type="button" aria-pressed={card.kind === "work"} onClick={() => onChange(setKind(template, card.key, "work"))} className={CHOICE} title="끝나면 정해진 다음 카드로 넘어가요">
            일
          </button>
          <button type="button" aria-pressed={card.kind === "judge"} onClick={() => onChange(setKind(template, card.key, "judge"))} className={CHOICE} title="지휘자가 결과를 보고 나가는 길 중 하나를 골라요">
            판단
          </button>
        </div>
        <button type="button" disabled={index === 0} onClick={() => onChange(moveCard(template, card.key, -1))} className={PILL} aria-label="위로">
          ↑
        </button>
        <button type="button" disabled={index === template.cards.length - 1} onClick={() => onChange(moveCard(template, card.key, 1))} className={PILL} aria-label="아래로">
          ↓
        </button>
        <button
          type="button"
          disabled={template.cards.length <= 1 || locked}
          title={locked ? "이미 세션이 있는 카드는 뺄 수 없어요" : undefined}
          onClick={() => onChange(removeCard(template, card.key))}
          className={`${PILL} text-accent`}
        >
          빼기
        </button>
      </div>
      <div className="flex items-end gap-1.5">
        <textarea
          rows={3}
          value={card.prompt}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => patch({ prompt: event.target.value })}
          placeholder={card.kind === "judge" ? "무엇을 보고 판단할지 · 예: /code-review로 리뷰하고 길을 골라" : "이 카드가 할 일 · 이번 작업 내용은 맨 위에 자동으로 붙어요"}
          className={`${INPUT} min-w-0 flex-1 resize-y leading-relaxed`}
        />
        <DictationButton onText={(text) => patch({ prompt: appendDictation(card.prompt, text) })} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted">
        <label className="flex items-center gap-1.5">
          모델
          <select value={card.model ?? "default"} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => patch({ model: event.target.value === "default" ? null : event.target.value })} className={INPUT}>
            {MODEL_CHOICES.map((model) => (
              <option key={model} value={model}>
                {model === "default" ? "기본" : model}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          effort
          <select value={card.effort ?? "auto"} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => patch({ effort: event.target.value === "auto" ? null : event.target.value })} className={INPUT}>
            {EFFORT_CHOICES.map((effort) => (
              <option key={effort} value={effort}>
                {effort === "auto" ? "기본" : effort}
              </option>
            ))}
          </select>
        </label>
        {card.kind === "work" && index > 0 && (!afterJudge || card.continueFrom) && (
          <label className="flex items-center gap-1.5" title="새 세션 대신 앞 카드의 세션에 이 카드의 프롬프트를 보내요">
            <input type="checkbox" checked={card.continueFrom} onChange={(event: React.ChangeEvent<HTMLInputElement>) => patch({ continueFrom: event.target.checked })} />
            앞 카드 세션에 이어서
          </label>
        )}
        <label className="flex items-center gap-1.5" title="이 카드가 끝나면 다음 카드로 넘기지 않고 계속 / 고쳐서 다시를 기다려요">
          <input type="checkbox" checked={card.pauseAfter} onChange={(event: React.ChangeEvent<HTMLInputElement>) => patch({ pauseAfter: event.target.checked })} />
          끝나면 멈춤
        </label>
      </div>
      <input
        value={card.check ?? ""}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => patch({ check: event.target.value.trim() ? event.target.value : null })}
        placeholder="확인 명령 (선택) · 턴이 끝날 때마다 워크트리에서 돌려 종료 코드 0일 때만 다음 카드로"
        className={`${INPUT} font-mono text-[12px]`}
      />
      {card.kind === "work" ? (
        <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-[12px] text-muted">
          끝나면
          <select
            value={routes[0]?.to ?? ""}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange(setNext(template, card.key, event.target.value || null))}
            className={INPUT}
          >
            <option value="">끝 (흐름 마침)</option>
            {others.map((other) => (
              <option key={other.key} value={other.key}>
                → {other.title}
              </option>
            ))}
          </select>
        </label>
        {routes[0] && <RouteFields template={template} route={routes[0]} onChange={onChange} />}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] text-muted">나가는 길 · 판단 카드의 지휘자가 조건 글을 읽고 하나를 골라요</p>
          {routes.map((route) => (
            <div key={route.id} className="flex flex-col gap-1.5 rounded-[8px] p-2 shadow-[inset_0_0_0_1px_var(--hair)]">
            <div className="flex items-center gap-2">
              <input
                value={route.label ?? ""}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(updateRoute(template, route.id, { label: event.target.value }))}
                placeholder="조건 글 · 예: 통과"
                className={`${INPUT} min-w-0 flex-1`}
              />
              <select value={route.to} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange(updateRoute(template, route.id, { to: event.target.value }))} className={INPUT}>
                {others.map((other) => (
                  <option key={other.key} value={other.key}>
                    → {other.title}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => onChange(removeRoute(template, route.id))} className={`${PILL} text-accent`}>
                빼기
              </button>
            </div>
            <RouteFields template={template} route={route} onChange={onChange} />
            </div>
          ))}
          <button type="button" disabled={others.length === 0} onClick={() => onChange(addRoute(template, card.key))} className={`${PILL} self-start`}>
            길 추가
          </button>
        </div>
      )}
    </li>
  );
}

export function TemplateEditor({ initial, isNew, run: editedRun, onClose }: TemplateEditorProps) {
  const queryClient = useQueryClient();
  const [template, setTemplate] = useState(initial);
  const [busy, setBusy] = useState(false);
  const problems = templateProblems(template);
  const builtin = template.id.startsWith(BUILTIN_TEMPLATE_PREFIX);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runOnly = editedRun !== undefined;
  const lockedKeys = new Set(editedRun ? [...Object.keys(editedRun.sessions), ...(editedRun.current ? [editedRun.current] : [])] : []);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      await queryClient.invalidateQueries({ queryKey: templateKeys.all });
      onClose();
    } catch (error) {
      toastError("template-editor", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-fg/20 p-6" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-label={runOnly ? "펼친 흐름 고치기" : "템플릿 편집"} className="flex w-full max-w-[720px] flex-col gap-4 rounded-[14px] bg-bg p-5 shadow-[0_24px_60px_-20px_var(--faint),inset_0_0_0_1px_var(--hair)]">
        <div className="flex items-center gap-3">
          <input
            value={template.name}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTemplate({ ...template, name: event.target.value })}
            placeholder="템플릿 이름"
            className={`${INPUT} min-w-0 flex-1 text-[16px] font-bold`}
          />
          <button type="button" onClick={onClose} className="text-[12px] text-muted hover:text-fg">
            닫기
          </button>
        </div>
        {runOnly ? (
          <p className="text-[12px] text-muted">
            이 워크트리에 펼친 흐름만 고쳐요. 고친 내용은 다음에 카드로 넘어갈 때부터 들어가요. 저장한 템플릿까지 바꾸려면 &lsquo;템플릿에도 저장&rsquo;을 눌러요.
          </p>
        ) : (
          <p className="text-[12px] text-muted">
            카드는 위에서부터 차례로 세션이 돼요. 템플릿은 모든 프로젝트에서 쓰는 <code>~/.local/share/agent-control/templates.json</code>에 저장돼서 파일을 직접 고칠 수도 있어요.
          </p>
        )}
        <ol className="flex flex-col gap-3">
          {template.cards.map((card, index) => (
            <CardEditor key={card.key} template={template} card={card} index={index} locked={lockedKeys.has(card.key)} onChange={setTemplate} />
          ))}
        </ol>
        <button type="button" onClick={() => setTemplate(addCard(template))} className={`${PILL} self-start`}>
          카드 추가
        </button>
        {problems.length > 0 && (
          <ul className="flex flex-col gap-1 text-[12px] text-accent">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2 border-t border-hair pt-4">
          <button
            type="button"
            disabled={busy || problems.length > 0}
            onClick={() => void run(() => (editedRun ? editRun(editedRun.id, template) : saveTemplate(template)))}
            className="rounded-full bg-fg px-4 py-1.5 text-[13px] font-semibold text-bg hover:opacity-85 disabled:opacity-30"
          >
            저장
          </button>
          {editedRun && (
            <button
              type="button"
              disabled={busy || problems.length > 0}
              onClick={() => void run(async () => {
                await editRun(editedRun.id, template);
                await saveTemplate({ ...template, id: editedRun.templateId });
              })}
              className={PILL}
            >
              템플릿에도 저장
            </button>
          )}
          <button type="button" onClick={onClose} className={PILL}>
            취소
          </button>
          {!isNew && !runOnly && !(builtin && template.updatedAt === 0) && (
            <button type="button" disabled={busy} onClick={() => void run(() => removeTemplate(template.id))} className={`${PILL} ml-auto text-accent`}>
              {builtin ? "기본으로 되돌리기" : "템플릿 지우기"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
