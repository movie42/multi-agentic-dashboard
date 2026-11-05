import { appendFile, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readTitlesFrom } from "./transcriptFile";

const CHUNK = 4 * 1024 * 1024;

async function tempFile(content: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "transcript-"));
  const file = path.join(dir, "s.jsonl");
  await writeFile(file, content);
  return file;
}

describe("readTitlesFrom", () => {
  it("decodes a Korean title that crosses a chunk boundary", async () => {
    const line = JSON.stringify({ type: "custom-title", customTitle: "한글 제목" });
    const prefixLength = line.indexOf("한") + 1;
    const filler = `${"x".repeat(CHUNK - prefixLength - 1)}\n`;
    const file = await tempFile(`${filler}${line}\n`);
    const { size } = await stat(file);
    expect((await readTitlesFrom(file, size, 0)).titles.custom).toBe("한글 제목");
  });

  it("resumes from the start of a line that was still being written", async () => {
    const line = JSON.stringify({ type: "custom-title", customTitle: "새 제목" });
    const file = await tempFile(`{"type":"user"}\n${line.slice(0, 10)}`);
    const first = await readTitlesFrom(file, (await stat(file)).size, 0);
    expect(first.titles.custom).toBeNull();
    await appendFile(file, `${line.slice(10)}\n`);
    const second = await readTitlesFrom(file, (await stat(file)).size, first.resumeAt);
    expect(second.titles.custom).toBe("새 제목");
  });
});
