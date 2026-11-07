"use client";

import { memo, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import type { Source } from "@/lib/api";

type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function hastText(node?: HastNode): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastText).join("");
}

export function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Turns citation markers like [1] or [1, 3] into links the renderer shows as
 * source chips. Code (fenced or inline, even while still streaming) is left alone.
 */
function linkCitations(text: string) {
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\](?!\()/g, (_match, numbers: string) =>
            numbers
              .split(",")
              .map((n) => `[${n.trim()}](#cite-${n.trim()})`)
              .join(""),
          ),
    )
    .join("");
}

export function useCopy(timeout = 1600) {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers / non-secure contexts.
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), timeout);
  };
  return { copied, copy };
}

function CodeBlock({ language, code, children }: { language: string; code: string; children: ReactNode }) {
  const { copied, copy } = useCopy();
  return (
    <div className="code-block">
      <div className="code-block__bar">
        <span>{language || "code"}</span>
        <button type="button" onClick={() => copy(code)} className="code-block__copy" aria-label="Copy code">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function CitationChip({ number, source }: { number: number; source?: Source }) {
  if (!source?.url) return <sup className="cite-missing">[{number}]</sup>;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="cite-chip"
      title={`${number}. ${source.title}`}
    >
      {domainOf(source.url)}
    </a>
  );
}

type MarkdownProps = { text: string; sources?: Source[] };

export const Markdown = memo(function Markdown({ text, sources = [] }: MarkdownProps) {
  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        if (href?.startsWith("#cite-")) {
          const number = Number(href.slice(6));
          return <CitationChip number={number} source={sources[number - 1]} />;
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
      pre({ node, children }) {
        const code = (node as HastNode | undefined)?.children?.find((child) => child.tagName === "code");
        const classes = (code?.properties?.className as string[] | undefined) ?? [];
        const language = classes.find((name) => name.startsWith("language-"))?.slice(9) ?? "";
        return (
          <CodeBlock language={language} code={hastText(code).replace(/\n$/, "")}>
            {children}
          </CodeBlock>
        );
      },
      table({ children }) {
        return (
          <div className="table-scroll">
            <table>{children}</table>
          </div>
        );
      },
    }),
    [sources],
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: false }]]}
      components={components}
    >
      {linkCitations(text)}
    </ReactMarkdown>
  );
});
