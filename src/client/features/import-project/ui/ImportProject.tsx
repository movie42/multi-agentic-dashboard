"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FolderPickResponse } from "@/common/actions/schema";
import { boardKeys } from "@/client/entities/board";
import { postAction } from "@/client/shared/api/actions";
import { readJson } from "@/client/shared/api/json";
import { Spinner } from "@/client/shared/ui/Spinner";

type Step =
  | { kind: "idle" }
  | { kind: "editing"; error: string | null }
  | { kind: "picking" }
  | { kind: "importing" }
  | { kind: "imported"; path: string };

async function pickFolder(): Promise<string | null> {
  const response = await fetch("/api/folder-picker", { method: "POST" });
  const payload = await readJson<FolderPickResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return payload.path;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ImportProject() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [folder, setFolder] = useState("");

  const close = () => {
    setStep({ kind: "idle" });
    setFolder("");
  };

  const runImport = async (target: string) => {
    if (!target.startsWith("/")) {
      setStep({ kind: "editing", error: "/ 로 시작하는 전체 경로를 적어 주세요" });
      return;
    }
    setStep({ kind: "importing" });
    try {
      await postAction({ type: "import-project", path: target });
      setFolder("");
      setStep({ kind: "imported", path: target });
      void queryClient.invalidateQueries({ queryKey: boardKeys.all });
    } catch (error) {
      console.error("[import-project]", target, error);
      setStep({ kind: "editing", error: messageOf(error) });
    }
  };

  const browse = async () => {
    setStep({ kind: "picking" });
    try {
      const picked = await pickFolder();
      if (picked === null) {
        setStep({ kind: "editing", error: null });
        return;
      }
      setFolder(picked);
      await runImport(picked);
    } catch (error) {
      console.error("[import-project] pick folder", error);
      setStep({ kind: "editing", error: `폴더 선택 창을 열지 못했어요: ${messageOf(error)}` });
    }
  };

  if (step.kind === "idle" || step.kind === "imported") {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setStep({ kind: "editing", error: null })}
          className="text-[12px] text-muted hover:text-fg"
        >
          + 프로젝트 불러오기
        </button>
        {step.kind === "imported" && (
          <p className="mt-1 text-[12px] break-all text-muted">
            <span className="font-mono">{step.path}</span>를 프로젝트로 추가했어요. 몇 초 안에 목록에 나타나요.
          </p>
        )}
      </div>
    );
  }

  const busy = step.kind === "picking" || step.kind === "importing";
  const error = step.kind === "editing" ? step.error : null;

  return (
    <form
      onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void runImport(folder.trim());
      }}
      className="mt-2 flex flex-col gap-2 rounded-[8px] bg-bg p-2.5 text-[12px]"
    >
      <p className="leading-relaxed text-muted">폴더를 고르면 프로젝트로 추가해요. git 저장소가 아니면 일반 폴더로 추가해요.</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void browse()}
        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-2.5 py-1 font-semibold text-accent-ink hover:opacity-85 disabled:opacity-60"
      >
        {step.kind === "picking" && <Spinner />}
        {step.kind === "picking" ? "폴더 고르는 중" : "폴더 선택"}
      </button>
      <input
        type="text"
        aria-label="프로젝트 경로"
        value={folder}
        disabled={busy}
        placeholder="또는 경로 직접 입력 · /Users/…"
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setFolder(event.target.value)}
        onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Escape") close();
        }}
        className="rounded-md bg-tint px-2.5 py-1.5 font-mono outline-none focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
      />
      {error && <p className="break-all text-accent">{error}</p>}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="submit"
          disabled={busy || folder.trim().length === 0}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:text-fg disabled:opacity-40"
        >
          {step.kind === "importing" && <Spinner />}
          {step.kind === "importing" ? "불러오는 중" : "불러오기"}
        </button>
        <button type="button" disabled={busy} onClick={close} className="rounded-full px-2.5 py-0.5 text-muted hover:text-fg">
          취소
        </button>
      </div>
    </form>
  );
}
