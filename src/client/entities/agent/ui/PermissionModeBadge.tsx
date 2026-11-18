import { permissionModeLabel } from "../model/permissionMode";

interface PermissionModeBadgeProps {
  mode: string | null;
}

const MODE_TONE: Record<string, string> = {
  bypassPermissions: "bg-ask/10 text-ask",
  auto: "bg-now/10 text-now",
};

export function PermissionModeBadge({ mode }: PermissionModeBadgeProps) {
  const label = permissionModeLabel(mode);
  if (!mode || !label) return null;
  return (
    <span
      data-permission-mode={mode}
      title="Claude Code의 권한 모드예요 · 터미널에서 Shift+Tab으로 바꿔요"
      className={`rounded-[5px] px-1.5 py-0.5 text-[12px] font-semibold ${MODE_TONE[mode] ?? "bg-tint text-muted"}`}
    >
      {label}
    </span>
  );
}
