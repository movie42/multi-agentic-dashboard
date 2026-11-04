import { connection, type NextRequest } from "next/server";
import type { HighlightResponse } from "@/common/intentDiff/types";
import { services } from "@/server/container";

const MAX_CODE = 50_000;

// Fence languages an answer uses, mapped to a file extension the highlighter knows.
const EXTENSION_BY_FENCE: Record<string, string> = {
  ts: ".ts",
  typescript: ".ts",
  tsx: ".tsx",
  js: ".js",
  javascript: ".js",
  jsx: ".jsx",
  mjs: ".mjs",
  json: ".json",
  css: ".css",
  md: ".md",
  markdown: ".md",
  html: ".html",
  yaml: ".yaml",
  yml: ".yaml",
  sh: ".sh",
  bash: ".sh",
  shell: ".sh",
  zsh: ".sh",
};

/** Colors a code block from an agent's answer the same way the diff colors its lines. */
export async function POST(request: NextRequest) {
  await connection();
  const body: unknown = await request.json().catch(() => null);
  const code = typeof body === "object" && body !== null && "code" in body && typeof body.code === "string" ? body.code : null;
  const lang = typeof body === "object" && body !== null && "lang" in body && typeof body.lang === "string" ? body.lang : "";
  if (code === null || code.length > MAX_CODE) {
    return Response.json({ ok: false, error: "code가 없거나 너무 길어요" } satisfies HighlightResponse, { status: 400 });
  }
  try {
    const extension = EXTENSION_BY_FENCE[lang.toLowerCase()] ?? "";
    return Response.json({ ok: true, html: await services().highlighter.lines(code, `answer${extension}`) } satisfies HighlightResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[intent-diff/highlight]", message);
    return Response.json({ ok: false, error: message } satisfies HighlightResponse, { status: 500 });
  }
}
