"use client";

import { useState } from "react";
import { editRun } from "@/client/entities/runner";
import { RouteFields, updateRoute } from "@/client/features/edit-template";
import { toastError } from "@/client/shared/model/toastStore";
import type { TemplateRoute, TemplateRun, WorkflowTemplate } from "@/common/templates/types";

const PILL =
  "shrink-0 rounded-full px-3 py-1 text-[12px] leading-5 font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint disabled:opacity-30";
const INPUT = "rounded-[8px] bg-tint px-2.5 py-1.5 text-[13px] text-fg outline-none placeholder:text-muted";

interface RouteEditorProps {
  run: TemplateRun;
  routeId: string;
  onEditRun: (run: TemplateRun) => void;
}

/** One line of an expanded template, edited like a line between sessions. */
export function RouteEditor({ run, routeId, onEditRun }: RouteEditorProps) {
  const original = run.routes.find((item) => item.id === routeId);
  const [route, setRoute] = useState<TemplateRoute | null>(original ?? null);
  const [saving, setSaving] = useState(false);
  if (!route || !original) return <p className="text-[13px] text-muted">이 선은 흐름에서 빠졌어요.</p>;
  // Built from the live run on every render so a save never overwrites what changed in the daemon meanwhile.
  const draft: WorkflowTemplate = { id: run.templateId, name: run.name, cards: run.cards, routes: run.routes.map((item) => (item.id === routeId ? route : item)), updatedAt: 0 };
  const setDraft = (next: WorkflowTemplate) => setRoute(next.routes.find((item) => item.id === routeId) ?? route);
  const title = (key: string) => run.cards.find((card) => card.key === key)?.title ?? key;
  const judge = run.cards.find((card) => card.key === route.from)?.kind === "judge";
  const editable = run.state === "expanded" || run.state === "running" || run.state === "paused";
  const changed = JSON.stringify(route) !== JSON.stringify(original);

  const save = async () => {
    setSaving(true);
    try {
      await editRun(run.id, draft);
    } catch (error) {
      toastError("template-route", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted">템플릿 선 · {run.name}</p>
      <p className="text-[13px]">
        {title(route.from)} → {title(route.to)}
      </p>
      {judge && (
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          조건 글 · 판단 카드가 이 글을 보고 길을 골라요
          <input
            value={route.label ?? ""}
            disabled={!editable}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft(updateRoute(draft, route.id, { label: event.target.value }))}
            className={INPUT}
          />
        </label>
      )}
      {editable ? (
        <RouteFields template={draft} route={route} onChange={setDraft} />
      ) : (
        <p className="text-[12px] text-muted">끝난 흐름이라 고칠 수 없어요.</p>
      )}
      {editable && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving || !changed || (judge && !route.label?.trim())}
            onClick={() => void save()}
            className="rounded-full bg-fg px-3.5 py-1 text-[12px] leading-5 font-semibold text-bg hover:opacity-85 disabled:opacity-30"
          >
            저장
          </button>
          <button type="button" onClick={() => onEditRun(run)} className={PILL}>
            흐름 전체 고치기
          </button>
        </div>
      )}
      <p className="text-[11px] text-muted">다음에 &lsquo;{title(route.from)}&rsquo; 카드가 끝날 때부터 고친 내용으로 넘어가요.</p>
    </section>
  );
}
