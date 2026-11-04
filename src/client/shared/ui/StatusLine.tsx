import { errorMessage } from "../model/errorMessage";

interface StatusLineProps {
  error: unknown;
  label: string;
}

export function StatusLine({ error, label }: StatusLineProps) {
  if (!error) return null;
  return (
    <p role="status" className="flex items-center gap-2 rounded-lg bg-tint px-3 py-1.5 text-[12px] text-muted">
      <span className="font-semibold text-accent">{label}</span>
      <span className="break-words">{errorMessage(error)}</span>
    </p>
  );
}
