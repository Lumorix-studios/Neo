import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const isBlock = match || props.node?.position?.start.line !== props.node?.position?.end.line;
    const isInline = !match && !String(children).includes("\n");
    const codeText = String(children).replace(/\n$/, "");

    if (!isBlock || isInline) {
      return (
        <code
          className="rounded-md border border-zinc-800 bg-zinc-900/90 px-1.5 py-0.5 font-mono text-[0.85em] text-amber-200/90"
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <div className="group relative my-4 overflow-hidden rounded-xl border border-zinc-800 bg-[#0b0b0e]">
        <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/60 px-4 py-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            {match ? match[1] : "code"}
          </span>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(codeText);
            }}
            className="rounded-md px-2 py-1 text-[10px] text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            Copy
          </button>
        </div>
        <pre className="scrollbar-thin overflow-x-auto p-4">
          <code className={`hljs font-mono text-[13px] leading-6 ${className || ""}`} {...props}>
            {children}
          </code>
        </pre>
      </div>
    );
  },
  a({ children, href }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="text-blue-400 underline decoration-blue-400/40 underline-offset-2 transition hover:text-blue-300 hover:decoration-blue-300"
      >
        {children}
      </a>
    );
  },
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 border-b border-zinc-800/60 pb-2 text-xl font-semibold text-zinc-100">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-6 text-lg font-semibold text-zinc-100">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-5 text-base font-semibold text-zinc-100">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-2 mt-4 text-sm font-semibold text-zinc-100">{children}</h4>
  ),
  p: ({ children }) => <p className="my-2 leading-7 text-zinc-300 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-6 text-zinc-300 marker:text-zinc-600">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-6 text-zinc-300 marker:text-zinc-600">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-7">{children}</li>,
  hr: () => <hr className="my-6 border-zinc-800/80" />,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-zinc-700 pl-4 text-zinc-400 italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-zinc-700 bg-zinc-900/60">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-800 px-3 py-2 text-left font-medium text-zinc-200">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-zinc-800 px-3 py-2 text-zinc-300">{children}</td>
  ),
  tr: ({ children }) => <tr className="even:bg-zinc-900/30">{children}</tr>,
  strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
  em: ({ children }) => <em className="text-zinc-100">{children}</em>,
};

interface MarkdownProps {
  content: string;
}

function MarkdownBase({ content }: MarkdownProps) {
  return (
    <div className="markdown-body text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownBase);

export default Markdown;