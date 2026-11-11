"use client";

import { useTransition } from "react";
import { Spinner } from "./Spinner";

interface PendingButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> {
  /** Must report its own failures (toast, inline message); a rejection is only logged here. */
  onRun: () => Promise<unknown>;
  /** Shown instead of the children while `onRun` is in flight. */
  pendingLabel?: React.ReactNode;
}

/** A button that shows a spinner and refuses clicks until its async action settles. */
export function PendingButton({ onRun, pendingLabel, disabled, className = "", children, ...rest }: PendingButtonProps) {
  const [pending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      await onRun().catch((error: unknown) => console.error("[pending-button]", error));
    });

  return (
    <button
      {...rest}
      type="button"
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={run}
      className={`inline-flex items-center justify-center gap-1.5 disabled:cursor-default ${pending ? "cursor-progress" : ""} ${className}`}
    >
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
