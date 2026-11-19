"use client";

import { useState } from "react";
import { usePromptColors } from "../model/usePromptColors";

// A colour input needs a hex value; with nothing picked it shows the default token for the current light/dark mode.
function tokenValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

interface ColorRowProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorRow({ label, value, onChange }: ColorRowProps) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-muted">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        aria-label={`요청 ${label} 색`}
        className="h-6 w-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
      />
      <span className="font-mono text-muted">{value}</span>
    </label>
  );
}

function PromptColorEditor() {
  const [colors, write] = usePromptColors();
  const background = colors.background ?? tokenValue("--prompt");
  const text = colors.text ?? tokenValue("--prompt-ink");
  const customized = colors.background !== null || colors.text !== null;

  return (
    <div className="mt-2 flex flex-col gap-2.5 rounded-[8px] bg-bg p-2.5">
      <p className="self-end rounded-2xl rounded-br-md bg-prompt px-3 py-1.5 text-[13px] text-prompt-ink">내가 보낸 요청</p>
      <ColorRow label="배경" value={background} onChange={(next) => write({ ...colors, background: next })} />
      <ColorRow label="글자" value={text} onChange={(next) => write({ ...colors, text: next })} />
      {customized && (
        <button
          type="button"
          onClick={() => write({ background: null, text: null })}
          className="self-start rounded-full px-2.5 py-1 text-[12px] font-semibold text-muted hover:text-fg"
        >
          기본 색으로
        </button>
      )}
    </div>
  );
}

export function PromptColorPanel() {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-8 text-[12px]" aria-label="요청 색">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-muted hover:text-fg"
      >
        <span className="font-bold tracking-[0.04em]">요청 색</span>
        <span className="size-3 rounded-full bg-prompt shadow-[inset_0_0_0_1px_var(--hair)]" aria-hidden />
        <span className="ml-auto" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && <PromptColorEditor />}
    </section>
  );
}
