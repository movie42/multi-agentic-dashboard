"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { mismatchOf, shortSha, type AppStatus, type AppStatusAction } from "@/common/appStatus/types";
import { PendingButton } from "@/client/shared/ui/PendingButton";
import { Spinner } from "@/client/shared/ui/Spinner";
import { APP_STATUS_BUSY_POLL_MS, APP_STATUS_POLL_MS, appStatusKey, fetchAppStatus, postAppStatus } from "../api/appStatus";

type Step = { kind: "list" } | { kind: "confirm-build" } | { kind: "confirm-restart" } | { kind: "started-build" };

function behindText(behind: number | null): string {
  if (behind === null) return "main과 비교할 수 없어요";
  return behind === 0 ? "main의 커밋을 모두 갖고 있어요" : `main보다 ${behind}커밋 뒤처져 있어요`;
}

interface RowProps {
  label: string;
  value: React.ReactNode;
  off?: boolean;
}

function Row({ label, value, off = false }: RowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`min-w-0 truncate text-right font-mono ${off ? "font-semibold text-ask" : ""}`}>{value}</dd>
    </div>
  );
}

const SMALL_BUTTON = "rounded-full px-2.5 py-0.5 text-[12px] font-semibold";
const PRIMARY = `${SMALL_BUTTON} bg-fg text-bg hover:opacity-85`;
const QUIET = `${SMALL_BUTTON} text-muted hover:text-fg`;

export function AppStatusPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: appStatusKey,
    queryFn: fetchAppStatus,
    refetchInterval: (current) => {
      const restart = current.state.data?.restart.kind;
      return restart === "scheduled" || restart === "restarting" ? APP_STATUS_BUSY_POLL_MS : APP_STATUS_POLL_MS;
    },
  });
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);

  const status = query.data;
  if (!status) {
    return (
      <section className="mt-8 text-[12px] text-muted">
        <p className="font-bold tracking-[0.04em]">앱 상태</p>
        <p className="mt-1">{query.isError ? "앱 상태를 읽지 못했어요" : "확인하는 중"}</p>
      </section>
    );
  }

  const mismatch = mismatchOf(status);
  const open = userOpen ?? mismatch.any;

  const run = async (action: AppStatusAction, next: Step) => {
    setError(null);
    try {
      queryClient.setQueryData<AppStatus>(appStatusKey, await postAppStatus(action));
      setStep(next);
    } catch (failure) {
      console.error("[apply-app]", action.type, failure);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const restart = status.restart;
  const appValue = status.app.kind === "dev" ? "개발 서버" : `${shortSha(status.app.commit)}${status.app.branch ? ` · ${status.app.branch}` : ""}`;
  const daemonValue = status.daemon.kind === "down" ? "꺼짐" : shortSha(status.daemon.commit);

  return (
    <section className="mt-8 text-[12px]" aria-label="앱 상태">
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-muted hover:text-fg"
      >
        <span className="font-bold tracking-[0.04em]">앱 상태</span>
        <span className={`size-1.5 rounded-full ${mismatch.any ? "bg-ask" : "bg-done"}`} aria-hidden />
        <span className={mismatch.any ? "font-semibold text-ask" : ""}>{mismatch.any ? "코드가 어긋나요" : "최신"}</span>
        {restart.kind === "scheduled" && <span className="text-now">재시작 예약됨</span>}
        <span className="ml-auto" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-3 rounded-[8px] bg-bg p-2.5">
          <dl className="flex flex-col gap-1">
            <Row label="설치된 앱" value={appValue} off={mismatch.app} />
            <Row label="데몬" value={daemonValue} off={mismatch.daemon} />
            <Row label="main" value={shortSha(status.checkout.mainCommit)} />
            <Row label="저장소 브랜치" value={status.checkout.branch ?? shortSha(status.checkout.commit)} />
          </dl>

          {step.kind === "confirm-build" && (
            <div className="flex flex-col gap-2 rounded-[6px] bg-tint p-2">
              <p className="leading-relaxed">
                지금 <span className="font-mono font-semibold">{status.checkout.branch ?? shortSha(status.checkout.commit)}</span> 브랜치 코드로
                빌드해요. <span className={status.checkout.behind ? "font-semibold text-ask" : ""}>{behindText(status.checkout.behind)}.</span>
              </p>
              <p className="leading-relaxed text-muted">셸 터미널 상자에서 빌드하고, 설치하는 동안 앱이 잠깐 꺼졌다 다시 켜져요.</p>
              <div className="flex flex-wrap gap-1.5">
                <PendingButton onRun={() => run({ type: "build-app" }, { kind: "started-build" })} className={PRIMARY}>
                  빌드 · 재설치
                </PendingButton>
                <button type="button" onClick={() => setStep({ kind: "list" })} className={QUIET}>
                  취소
                </button>
              </div>
            </div>
          )}

          {step.kind === "started-build" && (
            <p className="leading-relaxed text-muted">
              셸 터미널 상자에서 빌드를 시작했어요. 끝나면 앱이 다시 켜져요.
              <button type="button" onClick={() => setStep({ kind: "list" })} className="ml-1 underline decoration-faint underline-offset-[3px]">
                닫기
              </button>
            </p>
          )}

          {step.kind === "confirm-restart" && restart.kind !== "scheduled" && (
            <div className="flex flex-col gap-2 rounded-[6px] bg-tint p-2">
              <p className="leading-relaxed">
                {status.workingSessions > 0 ? (
                  <>
                    작업 중인 세션이 <span className="font-semibold text-now">{status.workingSessions}개</span> 있어요. 지금 재시작하면 하던 작업이
                    끊기고, 세션은 다시 열려요.
                  </>
                ) : (
                  "작업 중인 세션이 없어요. 열린 세션은 재시작 뒤 다시 열려요."
                )}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <PendingButton onRun={() => run({ type: "restart-daemon", when: "now" }, { kind: "list" })} pendingLabel="재시작하는 중" className={PRIMARY}>
                  지금 재시작
                </PendingButton>
                {status.workingSessions > 0 && (
                  <PendingButton onRun={() => run({ type: "restart-daemon", when: "idle" }, { kind: "list" })} className={`${SMALL_BUTTON} bg-tint-2 hover:opacity-85`}>
                    다 끝나면 재시작
                  </PendingButton>
                )}
                <button type="button" onClick={() => setStep({ kind: "list" })} className={QUIET}>
                  취소
                </button>
              </div>
            </div>
          )}

          {restart.kind === "scheduled" && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-[6px] bg-tint p-2">
              <p className="leading-relaxed">작업 중인 세션 {status.workingSessions}개가 끝나면 데몬을 재시작해요.</p>
              <PendingButton onRun={() => run({ type: "cancel-restart" }, { kind: "list" })} className={QUIET}>
                예약 취소
              </PendingButton>
            </div>
          )}

          {restart.kind === "restarting" && (
            <p className="flex items-center gap-1.5 text-muted">
              <Spinner />
              데몬을 재시작하는 중
            </p>
          )}

          {restart.kind === "failed" && <p className="break-all text-accent">데몬을 재시작하지 못했어요: {restart.message}</p>}
          {error && <p className="break-all text-accent">{error}</p>}

          {step.kind === "list" && restart.kind !== "scheduled" && restart.kind !== "restarting" && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setStep({ kind: "confirm-build" })} className={mismatch.app ? PRIMARY : `${SMALL_BUTTON} bg-tint hover:bg-tint-2`}>
                앱 빌드 · 재설치
              </button>
              <button type="button" onClick={() => setStep({ kind: "confirm-restart" })} className={mismatch.daemon ? PRIMARY : `${SMALL_BUTTON} bg-tint hover:bg-tint-2`}>
                데몬 재시작
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
