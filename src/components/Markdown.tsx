import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const isBlock = match || props.node?.position?.start.line !== props.node?.position?.end.line;
    // Newline char built at runtime so the source stays escape-sequence safe.
    const NL_CH = String.fromCharCode(10);
    const isInline = !match && !String(children).includes(NL_CH);
    const codeText = String(children).replace(new RegExp(NL_CH + "$"), "");

    if (!isBlock || isInline) {
      return (
        <code
          className="rounded border border-white/[0.08] bg-white/[0.05] px-1.5 py-0.5 font-mono text-[0.85em] text-[#e8d5a3]"
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <div className="group relative my-4 overflow-hidden rounded-lg border border-white/[0.08] bg-[#111111]">
        <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#161616] px-3 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#6b6b6b]">
            {match ? match[1] : "code"}
          </span>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(codeText);
            }}
            className="rounded px-2 py-0.5 text-[10px] text-[#6b6b6b] transition hover:bg-white/[0.06] hover:text-[#d4d4d4]"
          >
            Copy
          </button>
        </div>
        <pre className="scrollbar-thin overflow-x-auto p-3.5">
          <code className={`hljs font-mono text-[12.5px] leading-6 ${className || ""}`} {...props}>
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
        className="text-[#7aa7ff] underline decoration-[#7aa7ff]/40 underline-offset-2 transition hover:text-[#9dbaff] hover:decoration-[#9dbaff]/60"
      >
        {children}
      </a>
    );
  },
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 border-b border-white/[0.07] pb-2 text-xl font-semibold text-[#ececec]">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-6 text-lg font-semibold text-[#ececec]">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-5 text-base font-semibold text-[#ececec]">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-2 mt-4 text-sm font-semibold text-[#ececec]">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="my-2 leading-7 text-[#cfcfcf] first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-6 text-[#cfcfcf] marker:text-[#555555]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-6 text-[#cfcfcf] marker:text-[#555555]">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-7">{children}</li>,
  hr: () => <hr className="my-6 border-white/[0.08]" />,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-[#4a4a4a] pl-4 text-[#a3a3a3] italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-white/[0.1] bg-white/[0.03]">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border border-white/[0.08] px-3 py-2 text-left font-medium text-[#d4d4d4]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-white/[0.08] px-3 py-2 text-[#cfcfcf]">{children}</td>
  ),
  tr: ({ children }) => <tr className="even:bg-white/[0.02]">{children}</tr>,
  strong: ({ children }) => <strong className="font-semibold text-[#ececec]">{children}</strong>,
  em: ({ children }) => <em className="text-[#ececec]">{children}</em>,
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