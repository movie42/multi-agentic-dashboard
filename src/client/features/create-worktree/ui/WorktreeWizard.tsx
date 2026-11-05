"use client";

import { useState } from "react";
import { readJson } from "@/client/shared/api/json";
import type { WorktreeSummary } from "@/common/orca/types";
import type { WizardOrigin, WizardRequest, WizardResponse, WorktreePlan } from "@/common/worktreeWizard/types";

type Step =
  | { kind: "closed" }
  | { kind: "thinking"; label: string }
  | { kind: "ask"; sessionId: string; question: string; options: string[] }
  | { kind: "plan"; sessionId: string; plan: WorktreePlan }
  | { kind: "creating"; plan: WorktreePlan }
  | { kind: "created"; name: string };

type Turn = Extract<WizardResponse, { sessionId: string }>;

async function post(request: WizardRequest): Promise<WizardResponse> {
  const response = await fetch("/api/worktree-wizard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await readJson<WizardResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return payload;
}

/** The origin for a button on one worktree (`from`) or on the project header (`from` null). */
export function wizardOrigin(worktree: WorktreeSummary, from: boolean): WizardOrigin {
  return {
    repoId: worktree.worktreeId.split("::")[0] ?? "",
    repo: worktree.repo,
    anchorPath: worktree.path,
    from: from ? { path: worktree.path, branch: worktree.branch } : null,
  };
}

export function useWorktreeWizard(origin: WizardOrigin) {
  const [step, setStep] = useState<Step>({ kind: "closed" });
  const [error, setError] = useState<string | null>(null);

  const showTurn = (payload: WizardResponse) => {
    if (!payload.ok || !("sessionId" in payload)) return;
    const { sessionId, turn }: Turn = payload;
    setStep(turn.kind === "ask" ? { kind: "ask", sessionId, question: turn.question, options: turn.options } : { kind: "plan", sessionId, plan: turn.plan });
  };

  const run = async (label: string, request: WizardRequest, fallback: Step) => {
    setError(null);
    setStep({ kind: "thinking", label });
    try {
      showTurn(await post(request));
    } catch (runError) {
      console.error("[worktree-wizard]", runError);
      setError(runError instanceof Error ? runError.message : String(runError));
      setStep(fallback);
    }
  };

  const open = () => {
    if (step.kind !== "closed" && step.kind !== "created") return;
    void run("저장소를 살펴보는 중", { action: "start", origin }, { kind: "closed" });
  };

  const answer = (text: string) => {
    if (step.kind !== "ask" && step.kind !== "plan") return;
    void run("구성을 정하는 중", { action: "answer", origin, sessionId: step.sessionId, answer: text }, step);
  };

  const editPlan = (patch: Partial<WorktreePlan>) => {
    if (step.kind === "plan") setStep({ ...step, plan: { ...step.plan, ...patch } });
  };

  const create = async () => {
    if (step.kind !== "plan") return;
    const previous = step;
    setError(null);
    setStep({ kind: "creating", plan: step.plan });
    try {
      const payload = await post({ action: "create", origin, plan: step.plan });
      setStep({ kind: "created", name: "created" in payload ? payload.created.name : step.plan.name });
    } catch (createError) {
      console.error("[worktree-wizard] create", createError);
      setError(createError instanceof Error ? createError.message : String(createError));
      setStep(previous);
    }
  };

  const close = () => {
    setStep({ kind: "closed" });
    setError(null);
  };

  return { origin, step, error, open, answer, editPlan, create, close };
}

export type WorktreeWizard = ReturnType<typeof useWorktreeWizard>;

interface ReplyBoxProps {
  placeholder: string;
  onSend: (text: string) => void;
}

function ReplyBox({ placeholder, onSend }: ReplyBoxProps) {
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };
  return (
    <div className="flex gap-2">
      <input
        value={text}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-[8px] bg-bg px-3 py-1.5 text-[13px] outline-none placeholder:text-muted"
      />
      <button
        type="button"
        onClick={send}
        disabled={!text.trim()}
        className="shrink-0 rounded-full border border-hair px-3 py-1 text-[13px] hover:bg-bg disabled:opacity-30"
      >
        보내기
      </button>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
}

function Field({ label, value, onChange, mono = false }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-muted">
      {label}
      <input
        value={value}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        className={`rounded-[8px] bg-bg px-2.5 py-1.5 text-[13px] text-fg outline-none ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

interface PlanCardProps {
  wizard: WorktreeWizard;
  plan: WorktreePlan;
}

function PlanCard({ wizard, plan }: PlanCardProps) {
  const from = wizard.origin.from;
  return (
    <div className="flex flex-col gap-3">
      {plan.summary && <p className="text-[13px] leading-relaxed">{plan.summary}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="워크트리 이름" value={plan.name} onChange={(name) => wizard.editPlan({ name })} mono />
        <Field label="브랜치" value={plan.branch} onChange={(branch) => wizard.editPlan({ branch })} mono />
        <Field label="기준 브랜치" value={plan.baseBranch} onChange={(baseBranch) => wizard.editPlan({ baseBranch })} mono />
        <Field
          label="Jira 키 (없으면 비움)"
          value={plan.reference ?? ""}
          onChange={(reference) => wizard.editPlan({ reference: reference.trim() || null })}
          mono
        />
      </div>
      {from && (
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={plan.parent === "from"}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => wizard.editPlan({ parent: event.target.checked ? "from" : "none" })}
          />
          이 워크트리의 하위로 연결
        </label>
      )}
      <label className="flex flex-col gap-1 text-[12px] text-muted">
        첫 요청 · 채우면 새 워크트리에서 Claude 세션이 이 요청으로 시작해요
        <textarea
          rows={1}
          value={plan.firstPrompt}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => wizard.editPlan({ firstPrompt: event.target.value })}
          placeholder="비워 두면 워크트리와 터미널만 만들어요"
          className="field-sizing-content max-h-40 min-h-8 resize-none rounded-[8px] bg-bg px-2.5 py-1.5 text-[13px] leading-relaxed text-fg outline-none placeholder:text-muted"
        />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => void wizard.create()}
          className="shrink-0 rounded-full bg-fg px-3.5 py-1.5 text-[13px] font-semibold text-bg hover:opacity-85"
        >
          만들기
        </button>
        <div className="flex-1">
          <ReplyBox placeholder="에이전트에게 고칠 점 말하기 · 예: develop에서 따 줘" onSend={wizard.answer} />
        </div>
      </div>
    </div>
  );
}

interface WorktreeWizardPanelProps {
  wizard: WorktreeWizard;
}

export function WorktreeWizardPanel({ wizard }: WorktreeWizardPanelProps) {
  const { step, error, origin } = wizard;
  if (step.kind === "closed" && !error) return null;
  const base = origin.from ? (origin.from.branch ?? "현재 워크트리") : "기본 브랜치";

  return (
    <div className="flex flex-col gap-3 rounded-[10px] bg-tint p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] text-muted">
          새 워크트리 · {origin.repo} · 기준 <span className="font-mono">{base}</span>
        </p>
        <button type="button" onClick={wizard.close} className="text-[12px] text-muted hover:text-fg">
          닫기
        </button>
      </div>
      {step.kind === "thinking" && <p className="text-[13px] text-muted">{step.label}…</p>}
      {step.kind === "ask" && (
        <div className="flex flex-col gap-2">
          <p className="text-[14px] font-bold">{step.question}</p>
          {step.options.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {step.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => wizard.answer(option)}
                  className="rounded-lg bg-tint-2 px-3 py-1.5 text-left text-[13px] hover:bg-fg hover:text-bg"
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          <ReplyBox placeholder="Jira 키나 작업 한 줄 · Enter 보내기" onSend={wizard.answer} />
        </div>
      )}
      {step.kind === "plan" && <PlanCard wizard={wizard} plan={step.plan} />}
      {step.kind === "creating" && (
        <p className="text-[13px] text-muted">
          <span className="font-mono">{step.plan.name}</span> 워크트리를 만드는 중…
        </p>
      )}
      {step.kind === "created" && (
        <p className="text-[13px]">
          <span className="font-mono">{step.name}</span> 워크트리를 만들었어요. 몇 초 안에 보드에 나타나요.
        </p>
      )}
      {error && (
        <div className="flex items-center gap-2 text-[12px] text-accent">
          <span>{error}</span>
          {step.kind === "closed" && (
            <button type="button" onClick={wizard.open} className="underline">
              다시 시도
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface ProjectWorktreeWizardProps {
  /** Any worktree of the project; only its repo and checkout are used. */
  anchor: WorktreeSummary;
}

export function ProjectWorktreeWizard({ anchor }: ProjectWorktreeWizardProps) {
  const wizard = useWorktreeWizard(wizardOrigin(anchor, false));
  return (
    <div className="mt-3 flex flex-col gap-3">
      <button
        type="button"
        onClick={wizard.open}
        title="에이전트가 어떤 작업인지 묻고 기본 브랜치에서 새 워크트리를 만들어요"
        className="self-start rounded-full border border-hair px-3 py-1 text-[13px] hover:bg-tint"
      >
        새 워크트리
      </button>
      <WorktreeWizardPanel wizard={wizard} />
    </div>
  );
}
