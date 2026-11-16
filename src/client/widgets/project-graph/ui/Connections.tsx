"use client";

import type { SessionLink } from "@/common/orchestration/types";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { LINK_LABEL } from "../model/orchestration";

interface ConnectionsProps {
  sessionId: string;
  links: SessionLink[];
  nameOf: (sessionId: string) => string;
}

const run = (action: Parameters<typeof postAction>[0]) => void postAction(action).catch((error: unknown) => toastError(action.type, error));

export function Connections({ sessionId, links, nameOf }: ConnectionsProps) {
  if (links.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5 rounded-xl bg-tint p-3">
      <h3 className="font-mono text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">연결</h3>
      {links.map((link) => {
        const outgoing = link.from === sessionId;
        const other = nameOf(outgoing ? link.to : link.from);
        return (
          <div key={link.id} className="flex items-center gap-2 text-[12.5px]">
            <span className={`font-mono text-[11px] font-semibold ${link.kind === "report" ? "text-focus" : "text-fg"}`}>{outgoing ? "→" : "←"}</span>
            <span className="min-w-0 flex-1 truncate">
              {LINK_LABEL[link.kind]} · {other}
            </span>
            {link.paused && (
              <button type="button" onClick={() => run({ type: "resume-link", linkId: link.id })} className="shrink-0 font-semibold text-accent hover:underline">
                {link.trips}회에서 멈춤 · 다시 시작
              </button>
            )}
            <button
              type="button"
              aria-label="선 끊기"
              title="선 끊기"
              onClick={() => run({ type: "disconnect-sessions", linkId: link.id })}
              className="shrink-0 text-muted hover:text-accent"
            >
              ×
            </button>
          </div>
        );
      })}
    </section>
  );
}
