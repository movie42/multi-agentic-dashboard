"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProjectCommand } from "@/common/appStatus/types";
import { fetchProjectCommands, projectCommandsKey } from "../api/projectCommands";

const STALE_MS = 30_000;
const NONE: ProjectCommand[] = [];

export function useProjectCommands(projectPath: string): ProjectCommand[] {
  const query = useQuery({ queryKey: projectCommandsKey, queryFn: fetchProjectCommands, staleTime: STALE_MS });
  return query.data?.find((entry) => entry.projectPath === projectPath)?.commands ?? NONE;
}

export function useAllProjectCommands(): Map<string, ProjectCommand[]> {
  const query = useQuery({ queryKey: projectCommandsKey, queryFn: fetchProjectCommands, staleTime: STALE_MS });
  return new Map((query.data ?? []).map((entry) => [entry.projectPath, entry.commands]));
}
