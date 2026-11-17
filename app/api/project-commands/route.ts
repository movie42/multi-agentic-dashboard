import { connection } from "next/server";
import {
  projectCommandsRequestSchema,
  type ProjectCommandsListResponse,
  type ProjectCommandsProposalResponse,
} from "@/common/appStatus/types";
import { services } from "@/server/container";

async function listResponse(): Promise<ProjectCommandsListResponse> {
  const projects = await services().projects.list();
  return { ok: true, projects: projects.map((project) => ({ projectPath: project.path, commands: project.commands ?? [] })) };
}

export async function GET() {
  await connection();
  try {
    return Response.json(await listResponse());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[project-commands]", message);
    return Response.json({ ok: false, error: message } satisfies ProjectCommandsListResponse, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = projectCommandsRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid project commands request" } satisfies ProjectCommandsListResponse, { status: 400 });
  }
  const body = parsed.data;
  const { projects, commandAgent } = services();
  try {
    if (!(await projects.list()).some((project) => project.path === body.projectPath)) {
      throw new Error(`등록된 프로젝트가 아니에요: ${body.projectPath}`);
    }
    if (body.type === "save") {
      await projects.setCommands(body.projectPath, body.commands);
      return Response.json(await listResponse());
    }
    const proposals =
      body.type === "propose"
        ? await commandAgent.propose(body.projectPath)
        : await commandAgent.revise(body.projectPath, await projects.commandsOf(body.projectPath), body.request);
    return Response.json({ ok: true, proposals } satisfies ProjectCommandsProposalResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[project-commands]", body.type, message);
    return Response.json({ ok: false, error: message } satisfies ProjectCommandsProposalResponse, { status: 500 });
  }
}
