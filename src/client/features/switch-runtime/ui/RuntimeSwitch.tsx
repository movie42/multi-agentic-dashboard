"use client";

import { useEffect, useState } from "react";
import type { RuntimeMode, RuntimeResponse } from "@/lib/orca/runtime";

const POLL_MS = 15_000;

type SwitchTarget = Exclude<RuntimeMode, "off">;

const OPTIONS: { key: SwitchTarget; label: string; hint: string }[] = [
  { key: "app", label: "앱", hint: "Orca 앱 창을 띄워 둡니다" },
  { key: "headless", label: "헤드리스", hint: "Orca 앱을 종료하고 창 없이 런타임만 띄웁니다. 에이전트 터미널은 그대로 살아 있어요" },
];

type RuntimeState =
  | { status: "loading" }
  | { status: "ready"; mode: RuntimeMode }
  | { status: "switching"; mode: RuntimeMode; target: SwitchTarget };

async function requestRuntime(init?: RequestInit): Promise<RuntimeMode> {
  const response = await fetch("/api/runtime", { cache: "no-store", ...init });
  const payload = (await response.json()) as RuntimeResponse;
  if (!payload.ok) throw new Error(payload.error);
  return payload.mode;
}

export function RuntimeSwitch() {
  const [state, setState] = useState<RuntimeState>({ status: "loading" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const mode = await requestRuntime();
        if (!cancelled) setState((previous) => (previous.status === "switching" ? previous : { status: "ready", mode }));
      } catch (pollError) {
        console.error("[runtime] poll failed", pollError);
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const current = state.status === "loading" ? null : state.mode;

  const switchTo = async (target: SwitchTarget) => {
    if (state.status !== "ready" || state.mode === target) return;
    setError(null);
    setState({ status: "switching", mode: state.mode, target });
    try {
      const mode = await requestRuntime({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: target }),
      });
      setState({ status: "ready", mode });
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : String(switchError));
      const mode = await requestRuntime().catch(() => state.mode);
      setState({ status: "ready", mode });
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="flex rounded-full bg-bg p-0.5 text-[12px] font-semibold">
          {OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              title={option.hint}
              aria-pressed={current === option.key}
              disabled={state.status !== "ready"}
              onClick={() => switchTo(option.key)}
              className={`rounded-full px-3 py-1 leading-none disabled:cursor-default ${
                current === option.key ? "bg-fg text-bg" : "text-muted enabled:hover:text-fg"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted">
          {state.status === "loading" && "확인 중…"}
          {state.status === "switching" && `${state.target === "app" ? "앱" : "헤드리스"}로 전환 중…`}
          {state.status === "ready" && state.mode === "off" && "Orca 꺼짐"}
        </span>
      </div>
      {error && <p className="text-[11px] leading-relaxed text-accent">{error}</p>}
    </div>
  );
}
