import "server-only";
import { homedir } from "node:os";
import path from "node:path";

export const SKETCH_FILE = process.env.SKETCH_FILE ?? path.join(homedir(), ".local", "share", "agent-control", "sketches.json");
