import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TodoResponse } from "@/common/todos/types";

vi.mock("next/server", () => ({ connection: async () => undefined }));

let file = "";
let route: typeof import("../app/api/todos/route");

beforeAll(async () => {
  file = path.join(await mkdtemp(path.join(tmpdir(), "todos-route-")), "todos.json");
  vi.stubEnv("TODO_FILE", file);
  route = await import("../app/api/todos/route");
});

const post = (body: unknown) => route.POST(new Request("http://127.0.0.1/api/todos", { method: "POST", body: JSON.stringify(body) }));

describe("/api/todos", () => {
  it("round-trips a card through GET and POST into TODO_FILE", async () => {
    const created = (await (await post({ type: "card-create", title: "왕복" })).json()) as TodoResponse;
    expect(created.ok && created.createdId).toBeTruthy();
    const cardId = created.ok ? created.createdId! : "";
    expect((await post({ type: "card-move", cardId, statusId: "st-progress" })).status).toBe(200);
    const read = (await (await route.GET()).json()) as TodoResponse;
    expect(read.ok && read.board.cards.map((card) => `${card.title}:${card.statusId}`)).toEqual(["왕복:st-progress"]);
    expect(JSON.parse(await readFile(file, "utf8")).cards).toHaveLength(1);
  });

  it("answers 400 for an unknown op and 409 for a refused rule", async () => {
    expect((await post({ type: "nope" })).status).toBe(400);
    expect((await post({ type: "status-delete", statusId: "st-done" })).status).toBe(409);
  });
});
