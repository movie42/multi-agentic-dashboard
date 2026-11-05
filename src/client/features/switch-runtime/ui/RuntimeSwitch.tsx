"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { RuntimeMode } from "@/common/orca/runtime";
import { runtimeKeys, runtimeQueryOptions, switchRuntime } from "@/client/entities/runtime";
import { toastError } from "@/client/shared/model/toastStore";

type SwitchTarget = Exclude<RuntimeMode, "off">;

const OPTIONS: { key: SwitchTarget; label: string; hint: string }[] = [
  { key: "app", label: "앱", hint: "Orca 앱 창을 띄워 둡니다" },
  { key: "headless", label: "헤드리스", hint: "Orca 앱을 종료하고 창 없이 런타임만 띄웁니다. 에이전트 터미널은 그대로 살아 있어요" },
];

interface Switching {
  mode: RuntimeMode;
  target: SwitchTarget;
}

export function RuntimeSwitch() {
  const queryClient = useQueryClient();
  const runtime = useQuery(runtimeQueryOptions());
  const [switching, setSwitching] = useState<Switching | null>(null);

  const current = switching?.mode ?? runtime.data ?? null;
  const status = switching ? "switching" : runtime.data === undefined ? "loading" : "ready";

  const switchTo = async (target: SwitchTarget) => {
    if (switching || runtime.data === undefined || runtime.data === target) return;
    setSwitching({ mode: runtime.data, target });
    try {
      const mode = await switchRuntime(target);
      queryClient.setQueryData(runtimeKeys.all, mode);
    } catch (switchError) {
      toastError("runtime", switchError, { target });
      await runtime.refetch();
    }
    setSwitching(null);
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
              disabled={status !== "ready"}
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
          {status === "loading" && "확인 중…"}
          {switching && `${switching.target === "app" ? "앱" : "헤드리스"}로 전환 중…`}
          {status === "ready" && runtime.data === "off" && "Orca 꺼짐"}
        </span>
      </div>
    </div>
  );
}
