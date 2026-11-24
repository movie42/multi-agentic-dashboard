"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { A2uiSurface, MarkdownComponentContext } from "@a2ui/react";
import { MessageProcessor, STRICT_VALIDATION, type ActionPayload, type SurfaceModel } from "@a2ui/web_core";
import type { ReactComponentImplementation } from "@a2ui/react";
import type { UiAction } from "@/common/a2ui/actionText";
import { processErrors, surfaceIdOf, type A2uiMessage } from "@/common/a2ui/messages";
import { Markdown } from "@/client/shared/ui/Markdown";
import { appCatalog } from "./catalog";
import { A2uiLockContext } from "./lock";

type Built = { kind: "ok"; surface: SurfaceModel<ReactComponentImplementation> } | { kind: "error"; message: string };

interface ChatMarkdownProps {
  markdown: string;
}

function ChatMarkdown({ markdown }: ChatMarkdownProps) {
  return <Markdown text={markdown} />;
}

function build(messages: A2uiMessage[]): Built {
  const processor = new MessageProcessor<ReactComponentImplementation>([appCatalog], undefined, { validationConfig: STRICT_VALIDATION });
  const failure = processErrors(processor, messages);
  if (failure) return { kind: "error", message: failure };
  const id = surfaceIdOf(messages);
  const surface = id ? processor.model.surfacesMap.get(id) : undefined;
  return surface ? { kind: "ok", surface } : { kind: "error", message: "createSurface가 없어요" };
}

interface SurfaceProps {
  messages: A2uiMessage[];
  onAction: (action: UiAction) => void;
  locked: boolean;
}

function Surface({ messages, onAction, locked }: SurfaceProps) {
  const [built] = useState(() => build(messages));
  const emit = useEffectEvent((payload: ActionPayload) => onAction({ surfaceId: payload.surfaceId, name: payload.name, context: payload.context }));
  useEffect(() => {
    if (built.kind !== "ok") return;
    const subscription = built.surface.onAction.subscribe((payload) => emit(payload));
    return () => subscription.unsubscribe();
  }, [built]);
  if (built.kind === "error") return <p className="text-[12px] text-accent">카드를 그리지 못했어요: {built.message}</p>;
  return (
    <A2uiLockContext.Provider value={locked}>
      <MarkdownComponentContext.Provider value={ChatMarkdown}>
        <A2uiSurface surface={built.surface} />
      </MarkdownComponentContext.Provider>
    </A2uiLockContext.Provider>
  );
}

interface A2uiViewProps {
  messages: A2uiMessage[];
  onAction: (action: UiAction) => void;
  /** Answered or sending: controls stay visible but cannot be used. */
  locked?: boolean;
}

/** Draws one A2UI surface with the app catalog. New messages start a fresh surface, so form state resets with them. */
export function A2uiView({ messages, onAction, locked = false }: A2uiViewProps) {
  return <Surface key={JSON.stringify(messages)} messages={messages} onAction={onAction} locked={locked} />;
}
