"use client";

import { useQuery } from "@tanstack/react-query";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlightQueryOptions } from "../api/highlightQuery";

// Same type, size and token colors as the diff table in CodeLines; box and spacing come from `.md pre`.
const CODE_BLOCK =
  "font-mono text-[12px] leading-[1.6] whitespace-pre [&_span]:text-(color:--shiki-light) dark:[&_span]:text-(color:--shiki-dark)";

interface CodeBlockProps {
  code: string;
  lang: string;
  /** While the answer is still streaming the block may be cut off, so it stays uncolored. */
  live: boolean;
}

function CodeBlock({ code, lang, live }: CodeBlockProps) {
  const { data: lines } = useQuery(highlightQueryOptions(code, lang, !live));
  if (!lines) return <pre className={CODE_BLOCK}>{code}</pre>;
  return (
    <pre className={CODE_BLOCK}>
      {lines.map((line, index) => (
        <div key={index} dangerouslySetInnerHTML={{ __html: line || " " }} />
      ))}
    </pre>
  );
}

function textOf(node: unknown): string {
  if (typeof node !== "object" || node === null) return "";
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node && Array.isArray(node.children)) return node.children.map(textOf).join("");
  return "";
}

interface AnswerMarkdownProps {
  text: string;
  live?: boolean;
}

/** An agent's answer; fenced code is drawn like the diff's code. */
export function AnswerMarkdown({ text, live = false }: AnswerMarkdownProps) {
  const components: Components = {
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
    pre: ({ node }) => {
      const code = node?.children.find((child) => child.type === "element" && child.tagName === "code");
      const className = code?.type === "element" ? code.properties.className : undefined;
      const language = Array.isArray(className)
        ? (className.map(String).find((name) => name.startsWith("language-"))?.slice("language-".length) ?? "")
        : "";
      return <CodeBlock code={textOf(code).replace(/\n$/, "")} lang={language} live={live} />;
    },
  };
  return (
    // `.md` sets 15px outside any layer, so the smaller size needs `!` to win.
    <div className="md !text-[13px] !leading-[1.6]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
