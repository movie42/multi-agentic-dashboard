import type { TodoOp } from "@/common/todos/ops";

export type RunTodoOp = (op: TodoOp) => Promise<{ createdId?: string } | null>;
