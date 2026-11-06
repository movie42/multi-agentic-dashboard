import "server-only";
import { homedir } from "node:os";
import path from "node:path";

export const TODO_FILE = process.env.TODO_FILE ?? path.join(homedir(), ".local", "share", "agent-control", "todos.json");
