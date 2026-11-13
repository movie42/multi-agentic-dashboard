#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const dir = process.env.FAKE_RUNNER_DIR;
const port = Number(process.env.RUNNER_PORT);
const sessions = () => JSON.parse(readFileSync(path.join(dir, "sessions.json"), "utf8"));

http
  .createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    if (request.method !== "GET") {
      appendFileSync(path.join(dir, "calls.jsonl"), `${JSON.stringify({ method: request.method, url: request.url, body: body ? JSON.parse(body) : null })}\n`);
    }
    response.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": request.headers.origin ?? "*" });
    response.end(JSON.stringify({ ok: true, sessions: sessions() }));
  })
  .listen(port, "127.0.0.1");
