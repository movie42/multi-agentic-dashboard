"use client";

import { useState } from "react";
import { copyForSlack } from "@/client/shared/lib/slackClipboard";

interface SlackCopyButtonProps {
  source: React.RefObject<HTMLElement | null>;
  plainText: string;
}

export function SlackCopyButton({ source, plainText }: SlackCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!source.current) return;
    try {
      await copyForSlack(source.current, plainText);
      setCopied(true);
    } catch (error) {
      console.error("[message] clipboard", error);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      onBlur={() => setCopied(false)}
      className="self-start text-[12px] text-muted underline decoration-faint underline-offset-[3px] hover:text-fg"
    >
      {copied ? "복사했어요 · 슬랙에 붙여넣기" : "슬랙용으로 복사"}
    </button>
  );
}
