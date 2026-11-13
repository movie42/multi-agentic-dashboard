import "server-only";
import { stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Report } from "@/server/shared/fallback";
import { JsonFile } from "@/server/shared/JsonFile";
import { isMissingPath } from "@/server/shared/ports";

export type ProjectKind = "git" | "folder";

export interface Project {
  path: string;
  name: string;
  kind: ProjectKind;
}

const projectsFileSchema = z.object({
  projects: z.array(z.object({ path: z.string(), name: z.string(), kind: z.enum(["git", "folder"]) })),
});

type ProjectsFile = z.infer<typeof projectsFileSchema>;

export async function kindOf(folder: string): Promise<ProjectKind> {
  return stat(path.join(folder, ".git")).then(
    () => "git",
    (error: unknown) => {
      if (isMissingPath(error)) return "folder";
      throw error;
    },
  );
}

export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const next = (index: number): string => (taken.has(`${name}-${index}`) ? next(index + 1) : `${name}-${index}`);
  return next(2);
}

export function withUniqueNames(projects: Project[]): Project[] {
  return projects.reduce<Project[]>((kept, project) => {
    if (kept.some((other) => other.path === project.path)) return kept;
    return [...kept, { ...project, name: uniqueName(project.name, new Set(kept.map((other) => other.name))) }];
  }, []);
}

export class ProjectRegistry {
  private readonly file: JsonFile<ProjectsFile>;

  constructor(file: string, warn: Report) {
    this.file = new JsonFile({ file, schema: projectsFileSchema, empty: () => ({ projects: [] }), warn, scope: "projects" });
  }

  isInitialized(): Promise<boolean> {
    return this.file.exists();
  }

  async list(): Promise<Project[]> {
    return (await this.file.read()).projects;
  }

  async replaceAll(projects: Project[]): Promise<void> {
    await this.file.update(() => ({ projects: withUniqueNames(projects) }));
  }

  async add(folder: string): Promise<Project> {
    const target = path.resolve(folder);
    const info = await stat(target).catch((error: unknown) => {
      if (isMissingPath(error)) throw new Error(`폴더가 없어요: ${target}`);
      throw error;
    });
    if (!info.isDirectory()) throw new Error(`폴더가 아니에요: ${target}`);
    const kind = await kindOf(target);
    const next = await this.file.update((current) => ({
      projects: withUniqueNames([...current.projects, { path: target, name: path.basename(target), kind }]),
    }));
    const added = next.projects.find((project) => project.path === target);
    if (!added) throw new Error(`프로젝트를 추가하지 못했어요: ${target}`);
    return added;
  }
}
