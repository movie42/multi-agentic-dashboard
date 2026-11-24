"use client";

import { createComponentImplementation } from "@a2ui/react";
import type { ResolvedChildRef } from "@a2ui/web_core";
import { ButtonApi, CardApi, CheckBoxApi, ChoicePickerApi, ColumnApi, DividerApi, RowApi, TextApi } from "@a2ui/web_core/v1_0";
import { AppTextFieldApi, CodeApi, OptionApi, TableApi } from "@/common/a2ui/catalog";
import { Markdown } from "@/client/shared/ui/Markdown";
import { appendDictation, DictationButton } from "@/client/shared/ui/DictationButton";
import { useA2uiLocked } from "./lock";
import { useA2uiPreview } from "./preview";

const PRIMARY =
  "cursor-pointer rounded-full bg-fg px-4 py-1.5 text-[13px] leading-5 font-semibold text-bg hover:opacity-85 disabled:cursor-default disabled:opacity-30";
const SECONDARY =
  "cursor-pointer rounded-full px-4 py-1.5 text-[13px] leading-5 font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint-2 disabled:cursor-default disabled:opacity-30";
const BORDERLESS =
  "flex max-w-full cursor-pointer items-baseline gap-1.5 rounded-full bg-tint-2 px-3 py-1 text-left text-[12px] hover:bg-fg hover:text-bg disabled:cursor-default disabled:opacity-30";

const JUSTIFY: Record<string, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  spaceBetween: "justify-between",
  spaceAround: "justify-around",
  spaceEvenly: "justify-evenly",
  stretch: "justify-stretch",
};

type ChildRef = string | ResolvedChildRef;

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item: unknown) => (typeof item === "string" ? [item] : [])) : [];
}
type BuildChild = (id: string, basePath?: string) => React.ReactNode;

function childNodes(children: readonly ChildRef[] | undefined, buildChild: BuildChild): React.ReactNode[] {
  return (children ?? []).map((child) =>
    typeof child === "string" ? (
      <div key={child} className="contents">
        {buildChild(child)}
      </div>
    ) : (
      <div key={`${child.id}:${child.basePath}`} className="contents">
        {buildChild(child.id, child.basePath)}
      </div>
    ),
  );
}

export const AppText = createComponentImplementation(TextApi, ({ props }) => {
  const text = props.text ?? "";
  if (props.variant === "caption") return <span className="text-[12px] text-muted">{text}</span>;
  return <Markdown text={text} />;
});

export const AppButton = createComponentImplementation(ButtonApi, ({ props, buildChild }) => {
  const locked = useA2uiLocked();
  const className = props.variant === "primary" ? PRIMARY : props.variant === "borderless" ? BORDERLESS : SECONDARY;
  return (
    <button type="button" disabled={locked || props.isValid === false} onClick={() => void props.action?.()} className={className}>
      {props.child ? buildChild(props.child) : null}
    </button>
  );
});

export const AppRow = createComponentImplementation(RowApi, ({ props, buildChild }) => (
  <div className={`flex flex-wrap items-center gap-2 ${JUSTIFY[props.justify ?? "start"] ?? ""}`}>{childNodes(props.children, buildChild)}</div>
));

export const AppColumn = createComponentImplementation(ColumnApi, ({ props, buildChild }) => (
  <div className={`flex flex-col gap-2.5 ${JUSTIFY[props.justify ?? "start"] ?? ""}`}>{childNodes(props.children, buildChild)}</div>
));

export const AppCard = createComponentImplementation(CardApi, ({ props, buildChild }) => (
  <div className="max-h-96 overflow-auto rounded-lg bg-tint-2 px-3 py-2">{props.child ? buildChild(props.child) : null}</div>
));

export const AppDivider = createComponentImplementation(DividerApi, ({ props }) =>
  props.axis === "vertical" ? <span className="w-px self-stretch bg-[var(--hair)]" /> : <hr className="border-[var(--hair)]" />,
);

export const AppChoicePicker = createComponentImplementation(ChoicePickerApi, ({ props }) => {
  const locked = useA2uiLocked();
  const selected = stringList(props.value);
  const multiple = props.variant === "multipleSelection";
  const toggle = (value: string) => {
    const next = multiple ? (selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]) : [value];
    props.setValue(next);
  };
  return (
    <div className="flex flex-col gap-1.5">
      {props.label && <p className="text-[13px] font-semibold">{props.label}</p>}
      <div className="flex flex-wrap gap-1.5">
        {(props.options ?? []).map((option) => {
          const on = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              disabled={locked}
              aria-pressed={on}
              onClick={() => toggle(option.value)}
              className={`cursor-pointer rounded-full px-3 py-1 text-[12px] disabled:cursor-default disabled:opacity-40 ${
                on ? "bg-fg text-bg" : "bg-bg shadow-[inset_0_0_0_1px_var(--hair)] hover:shadow-[inset_0_0_0_1.5px_var(--fg)]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
});

export const AppTextField = createComponentImplementation(AppTextFieldApi, ({ props, accessibilityRef }) => {
  const locked = useA2uiLocked();
  const value = props.value ?? "";
  const onChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => props.setValue(event.target.value);
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || !props.action || !value.trim()) return;
    event.preventDefault();
    void props.action();
  };
  const field =
    props.variant === "longText" ? (
      <textarea
        ref={accessibilityRef}
        rows={1}
        disabled={locked}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={props.placeholder ?? ""}
        className="field-sizing-content max-h-32 min-h-6 flex-1 resize-none bg-transparent text-[13px] leading-relaxed outline-none placeholder:text-muted"
      />
    ) : (
      <input
        ref={accessibilityRef}
        type={props.variant === "obscured" ? "password" : props.variant === "number" ? "number" : "text"}
        disabled={locked}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={props.placeholder ?? ""}
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
      />
    );
  return (
    <label className="flex flex-col gap-1">
      {props.label && <span className="text-[12px] font-semibold text-muted">{props.label}</span>}
      <span className="flex items-end gap-1.5 rounded-lg bg-bg px-3 py-2 shadow-[inset_0_0_0_1px_var(--hair)] focus-within:shadow-[inset_0_0_0_1.5px_var(--faint)]">
        {field}
        {props.variant !== "obscured" && props.variant !== "number" && (
          <DictationButton disabled={locked} onText={(text) => props.setValue(appendDictation(value, text))} />
        )}
      </span>
    </label>
  );
});

export const AppCheckBox = createComponentImplementation(CheckBoxApi, ({ props, accessibilityRef }) => {
  const locked = useA2uiLocked();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
      <input ref={accessibilityRef} type="checkbox" disabled={locked} checked={props.value ?? false} onChange={(event) => props.setValue(event.target.checked)} />
      {props.label}
    </label>
  );
});

export const AppOption = createComponentImplementation(OptionApi, ({ props }) => {
  const locked = useA2uiLocked();
  const preview = useA2uiPreview();
  const value = props.value ?? props.label ?? "";
  const selectable = props.selection !== undefined;
  const selection = stringList(props.selection);
  const on = selectable && selection.includes(value);
  const pick = () => {
    if (selectable) {
      const nextOn = props.single || !on;
      props.setSelection(props.single ? [value] : on ? selection.filter((item) => item !== value) : [...selection, value]);
      if (nextOn && (props.single || props.preview)) preview.pin(props.preview ?? null);
      if (!nextOn && props.preview) preview.unpin(props.preview);
    }
    void props.action?.();
  };
  const peek = props.preview ? () => preview.peek(props.preview ?? null) : undefined;
  const unpeek = props.preview ? () => preview.peek(null) : undefined;
  return (
    <button
      type="button"
      disabled={locked}
      aria-pressed={selectable ? on : undefined}
      onClick={pick}
      onMouseEnter={peek}
      onMouseLeave={unpeek}
      onFocus={peek}
      onBlur={unpeek}
      className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-[13px] leading-snug disabled:cursor-default disabled:opacity-40 ${
        on ? "bg-fg text-bg" : "bg-bg shadow-[inset_0_0_0_1px_var(--hair)] hover:shadow-[inset_0_0_0_1.5px_var(--fg)]"
      }`}
    >
      <span className="font-semibold">
        {selectable && !props.single && <span className="mr-1.5 font-mono">{on ? "☑" : "☐"}</span>}
        {props.label}
      </span>
      {props.description && <span className="text-[12px] opacity-70">{props.description}</span>}
    </button>
  );
});

export const AppCode = createComponentImplementation(CodeApi, ({ props }) => (
  <pre className="max-h-48 overflow-auto rounded-lg bg-tint-2 px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">{props.text}</pre>
));

export const AppTable = createComponentImplementation(TableApi, ({ props }) => (
  <div className="overflow-auto rounded-lg shadow-[inset_0_0_0_1px_var(--hair)]">
    <table className="w-full text-left text-[12px]">
      <thead>
        <tr>
          {(props.columns ?? []).map((column, index) => (
            <th key={`${index}:${column}`} className="border-b border-[var(--hair)] px-3 py-1.5 font-semibold">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(props.rows ?? []).map((row, rowIndex) => (
          <tr key={`${rowIndex}:${row.join("|")}`} className="border-b border-[var(--hair)] last:border-0">
            {row.map((cell, cellIndex) => (
              <td key={`${cellIndex}:${cell}`} className="px-3 py-1.5 align-top">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
));
