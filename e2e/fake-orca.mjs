#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";

const dir = process.env.FAKE_ORCA_DIR;
const args = process.argv.slice(2).filter((arg) => arg !== "--json");
appendFileSync(path.join(dir, "calls.jsonl"), `${JSON.stringify(args)}\n`);

const reply = (result) => process.stdout.write(JSON.stringify({ ok: true, result }));
const fixture = (name) => JSON.parse(readFileSync(path.join(dir, name), "utf8"));
const command = args.slice(0, 2).join(" ");

if (command === "worktree ps") reply(fixture("worktree-ps.json"));
else if (command === "terminal list") reply(fixture("terminal-list.json"));
else if (command === "terminal read") reply({ terminal: { tail: ["$ "] } });
else if (args[0] === "status") reply({ app: { running: false, pid: null }, runtime: { reachable: false } });
else if (command === "terminal send" || command === "terminal close" || command === "agent launch") reply({});
else {
  process.stdout.write(JSON.stringify({ ok: false, error: `fake orca: unsupported ${args.join(" ")}` }));
  process.exit(1);
}
