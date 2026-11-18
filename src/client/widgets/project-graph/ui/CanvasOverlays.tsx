"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { draftTemplateFromText, expandTemplate, templatesQueryOptions } from "@/client/entities/runner";
import { toastError } from "@/client/shared/model/toastStore";
import type { WorkflowTemplate } from "@/common/templates/types";
import type { LinkKind } from "@/common/orchestration/types";
import { ConductorLauncher } from "@/client/features/conduct-sessions";
import type { Point } from "../model/layout";
import { appendDictation, DictationButton } from "@/client/shared/ui/DictationButton";

const CHOICE =
  "rounded-full px-3 py-1 text-[12px] leading-none font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint aria-pressed:bg-fg aria-pressed:text-bg";

const PICK_KINDS: ReadonlyArray<{
  kind: LinkKind;
  label: string;
  hint: string;
}> = [
  { kind: "delegate", label: "맡김", hint: "적은 일을 뒤 세션에 바로 보내요" },
  {
    kind: "report",
    label: "끝나면 보고",
    hint: "앞 세션이 턴을 마치면 마지막 답을 뒤 세션에 넣어요",
  },
  {
    kind: "next",
    label: "끝나면 다음",
    hint: "앞 세션이 턴을 마치면 뒤 세션에 할 말을 보내요",
  },
  {
    kind: "watch",
    label: "터미널 연결",
    hint: "뒤 세션이 앞 세션의 터미널 출력을 필요할 때 직접 읽어요",
  },
];

/** Keeps a popover at screen size whatever the canvas zoom is. */
function ScreenSized({
  at,
  zoom,
  children,
}: {
  at: Point;
  zoom: number;
  children: React.ReactNode;
}) {
  return (
    <g transform={`translate(${at.x} ${at.y}) scale(${1 / zoom})`}>
      {children}
    </g>
  );
}

interface ConnectPickerProps {
  at: Point;
  zoom: number;
  fromTitle: string;
  toTitle: string;
  onPick: (kind: LinkKind, prompt: string | null) => void;
  onCancel: () => void;
}

/** Asks which line to draw after a drag in connect mode lands on another box. */
export function ConnectPicker({
  at,
  zoom,
  fromTitle,
  toTitle,
  onPick,
  onCancel,
}: ConnectPickerProps) {
  const [kind, setKind] = useState<LinkKind>("delegate");
  const [prompt, setPrompt] = useState("");
  const asksPrompt = kind === "delegate" || kind === "next";
  return (
    <ScreenSized at={at} zoom={zoom}>
      <foreignObject
        width={320}
        height={asksPrompt ? 240 : 170}
        className="overflow-visible"
      >
        <div className="flex flex-col gap-2 rounded-[12px] bg-bg p-3 text-[13px] shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]">
          <p className="truncate text-[12px] text-muted">
            {fromTitle} → {toTitle}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PICK_KINDS.map((option) => (
              <button
                key={option.kind}
                type="button"
                aria-pressed={kind === option.kind}
                title={option.hint}
                onClick={() => setKind(option.kind)}
                className={CHOICE}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-muted">
            {PICK_KINDS.find((option) => option.kind === kind)?.hint}
          </p>
          {asksPrompt && (
            <textarea
              rows={3}
              autoFocus
              value={prompt}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setPrompt(event.target.value)
              }
              placeholder={kind === "delegate" ? "무엇을 맡길까요?" : "뒤 세션에 보낼 말 · 비우면 앞 세션의 마지막 답을 넣어요"}
              className="resize-none rounded-[8px] bg-tint px-2.5 py-2 text-[13px] outline-none placeholder:text-muted"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={kind === "delegate" && !prompt.trim()}
              onClick={() =>
                onPick(kind, asksPrompt && prompt.trim() ? prompt : null)
              }
              className="rounded-full bg-fg px-3.5 py-1 text-[12px] leading-5 font-semibold text-bg hover:opacity-85 disabled:opacity-30"
            >
              {kind === "delegate" ? "맡기기" : "잇기"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-3.5 py-1 text-[12px] leading-5 font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint"
            >
              취소
            </button>
          </div>
        </div>
      </foreignObject>
    </ScreenSized>
  );
}


interface ConductorPopoverProps {
  at: Point;
  zoom: number;
  worktreePath: string;
  worktreeName: string;
  onClose: () => void;
}

/** Starts a conductor for one worktree right where its frame was right-clicked. */
export function ConductorPopover({ at, zoom, worktreePath, worktreeName, onClose }: ConductorPopoverProps) {
  return (
    <ScreenSized at={at} zoom={zoom}>
      <foreignObject width={380} height={260} className="overflow-visible">
        <div className="rounded-[12px] bg-bg shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]">
          <ConductorLauncher worktreePath={worktreePath} scope="worktree" scopeName={worktreeName} onClose={onClose} />
        </div>
      </foreignObject>
    </ScreenSized>
  );
}


interface TemplatePopoverProps {
  at: Point;
  zoom: number;
  worktreePath: string;
  worktreeName: string;
  branch: string | null;
  onEdit: (template: WorkflowTemplate | null) => void;
  onDraft: (template: WorkflowTemplate) => void;
  onClose: () => void;
}

/** Shared root branches name a line of history, not a task, so they cannot stand in for an empty task description. */
const ROOT_BRANCH = /^(main|master|develop|trunk)$|^release\//;

export function TemplatePopover({ at, zoom, worktreePath, worktreeName, branch, onEdit, onDraft, onClose }: TemplatePopoverProps) {
  const templates = useQuery(templatesQueryOptions());
  const list = templates.data ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const [intent, setIntent] = useState("");
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState("");
  const [drafting, setDrafting] = useState(false);
  const chosen = list.find((template) => template.id === picked) ?? list[0] ?? null;
  const fallbackIntent = branch && !ROOT_BRANCH.test(branch) ? branch : null;
  const canExpand = Boolean(chosen) && !busy && Boolean(intent.trim() || fallbackIntent);

  const draft = async () => {
    if (!description.trim()) return;
    setDrafting(true);
    try {
      onDraft(await draftTemplateFromText(description.trim(), list));
      onClose();
    } catch (error) {
      toastError("template-draft", error);
    } finally {
      setDrafting(false);
    }
  };

  const expand = async (start: boolean) => {
    if (!chosen || !canExpand) return;
    setBusy(true);
    try {
      await expandTemplate({ templateId: chosen.id, cwd: worktreePath, intent: intent.trim() || fallbackIntent || "", start });
      onClose();
    } catch (error) {
      toastError("template-expand", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenSized at={at} zoom={zoom}>
      <foreignObject width={360} height={440} className="overflow-visible">
        <div className="flex flex-col gap-2.5 rounded-[12px] bg-bg p-3 text-[13px] shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]">
          <p className="truncate text-[12px] text-muted">템플릿 펼치기 · {worktreeName}</p>
          {templates.isPending && <p className="text-[12px] text-muted">템플릿을 읽는 중…</p>}
          {templates.error && <p className="text-[12px] text-accent">{templates.error.message}</p>}
          {!templates.isPending && list.length === 0 && <p className="text-[12px] text-muted">저장한 템플릿이 없어요. 새로 만들거나, 캔버스에서 세션을 골라 &lsquo;템플릿으로 저장&rsquo;을 눌러요.</p>}
          {list.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {list.map((template) => (
                <button key={template.id} type="button" aria-pressed={chosen?.id === template.id} onClick={() => setPicked(template.id)} className={CHOICE}>
                  {template.name} · {template.cards.length}
                </button>
              ))}
            </div>
          )}
          {chosen && <p className="truncate text-[12px] text-muted">{chosen.cards.map((card) => card.title).join(" → ")}</p>}
          <div className="flex items-end gap-1.5">
            <textarea
              rows={3}
              value={intent}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setIntent(event.target.value)}
              placeholder={
                fallbackIntent
                  ? `이번 작업 내용 · 모든 카드 프롬프트 맨 위에 붙어요. 비우면 '${fallbackIntent}'`
                  : `이번 작업 내용 · 모든 카드 프롬프트 맨 위에 붙어요. ${branch ? `'${branch}'는 작업 이름이 아니라서` : "브랜치가 없어서"} 꼭 적어야 시작할 수 있어요`
              }
              className="min-w-0 flex-1 resize-none rounded-[8px] bg-tint px-2.5 py-2 text-[13px] outline-none placeholder:text-muted"
            />
            <DictationButton onText={(text) => setIntent(appendDictation(intent, text))} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!canExpand} onClick={() => void expand(true)} className="rounded-full bg-fg px-3.5 py-1 text-[12px] leading-5 font-semibold text-bg hover:opacity-85 disabled:opacity-30">
              펼치고 시작
            </button>
            <button type="button" disabled={!canExpand} onClick={() => void expand(false)} className={CHOICE}>
              펼치기만
            </button>
            {chosen && (
              <button type="button" onClick={() => onEdit(chosen)} className={CHOICE}>
                고치기
              </button>
            )}
            <button type="button" onClick={() => onEdit(null)} className={CHOICE}>
              새 템플릿
            </button>
            <button type="button" onClick={onClose} className="ml-auto text-[12px] text-muted hover:text-fg">
              닫기
            </button>
          </div>
          <div className="flex flex-col gap-1.5 border-t border-hair pt-2.5">
            <p className="text-[12px] text-muted">말로 만들기 · 흐름을 한 줄로 적으면 카드와 길을 채운 초안을 편집 창에 띄워요</p>
            <div className="flex items-end gap-1.5">
              <textarea
                rows={2}
                value={description}
                disabled={drafting}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(event.target.value)}
                onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void draft();
                }}
                placeholder="예: flow대로 계획하고 구현한 뒤, 리뷰에서 고칠 게 있으면 구현으로 돌려"
                className="min-w-0 flex-1 resize-none rounded-[8px] bg-tint px-2.5 py-2 text-[13px] outline-none placeholder:text-muted"
              />
              <DictationButton disabled={drafting} onText={(text) => setDescription(appendDictation(description, text))} />
              <button type="button" disabled={!description.trim() || drafting} onClick={() => void draft()} className={CHOICE}>
                {drafting ? "만드는 중…" : "만들기"}
              </button>
            </div>
          </div>
        </div>
      </foreignObject>
    </ScreenSized>
  );
}
