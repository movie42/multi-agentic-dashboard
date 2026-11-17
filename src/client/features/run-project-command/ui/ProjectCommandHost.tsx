"use client";

import { useCommandRequestStore } from "@/client/entities/project-commands";
import { ManageCommandsDialog } from "./ManageCommandsDialog";
import { RunCommandDialog } from "./RunCommandDialog";

export function ProjectCommandHost() {
  const request = useCommandRequestStore((state) => state.request);
  const clear = useCommandRequestStore((state) => state.clear);
  if (!request) return null;
  if (request.kind === "run") return <RunCommandDialog worktree={request.worktree} command={request.command} onClose={clear} />;
  return <ManageCommandsDialog key={`${request.worktree.projectPath}:${request.mode}`} worktree={request.worktree} mode={request.mode} onClose={clear} />;
}
