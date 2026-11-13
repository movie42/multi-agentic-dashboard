"use client";

import type { UseQueryResult } from "@tanstack/react-query";

function lineTone(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "text-muted";
  if (line.startsWith("+")) return "bg-done/10 text-done";
  if (line.startsWith("-")) return "bg-accent/10 text-accent";
  if (line.startsWith("@@")) return "text-pr";
  return "";
}

interface DiffBlockProps {
  query: UseQueryResult<string, Error>;
}

export function DiffBlock({ query }: DiffBlockProps) {
  if (query.isPending) return <p className="py-1 text-[12px] text-muted">불러오는 중…</p>;
  if (query.isError) return <p className="py-1 text-[12px] text-accent">{query.error.message}</p>;
  const lines = query.data.split("\n").filter((line) => !/^(diff --git|index |new file mode|deleted file mode|similarity index|rename from|rename to)/.test(line));
  if (lines.every((line) => line.trim() === "")) return <p className="py-1 text-[12px] text-muted">보여 줄 변경이 없어요 (바이너리이거나 모드만 바뀜)</p>;
  return (
    <pre className="my-1 max-h-96 overflow-auto rounded-md bg-tint py-1.5 font-mono text-[11px] leading-[1.55]">
      {lines.map((line, index) => (
        <div key={index} className={`px-2 whitespace-pre ${lineTone(line)}`}>
          {line || " "}
        </div>
      ))}
    </pre>
  );
}
