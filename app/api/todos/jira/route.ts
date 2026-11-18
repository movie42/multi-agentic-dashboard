import { connection } from "next/server";
import type { TodoJiraImportResponse, TodoJiraStatuses, TodoJiraStatusResponse } from "@/common/todos/types";
import { services } from "@/server/container";

/** Cached Jira statuses for every key on the board's cards; keys still loading are left out and fill in on a later poll. */
export async function GET() {
  await connection();
  try {
    const board = await services().todos.read();
    const keys = new Set(board.cards.filter((card) => card.archivedAt === null).flatMap((card) => card.jira.map((jira) => jira.key)));
    const statuses: TodoJiraStatuses = Object.fromEntries(
      [...keys].flatMap((key) => {
        const status = services().workflow.jira.statusOf(key);
        return status ? [[key, status] as const] : [];
      }),
    );
    return Response.json({ ok: true, statuses } satisfies TodoJiraStatusResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[todos] jira status", message);
    return Response.json({ ok: false, error: message } satisfies TodoJiraStatusResponse, { status: 500 });
  }
}

export async function POST() {
  try {
    const { added, total } = await services().todoJira.run();
    return Response.json({ ok: true, added, total, board: await services().todos.read() } satisfies TodoJiraImportResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[todos] jira import", message);
    return Response.json({ ok: false, error: message } satisfies TodoJiraImportResponse, { status: 502 });
  }
}
