import { useMemo, useDeferredValue } from "react";

type Tab = { path: string; content: string };
function langOf(p: string) { return p + "-lang"; }

export default function C1({ tabs, activePath }: { tabs: Tab[]; activePath: string | null }) {
  const active = tabs.find((t) => t.path === activePath) ?? null;
  const activeContent = active?.content ?? "";
  const activeLang = active ? langOf(active.path) : "text";
  const d = useDeferredValue(activeContent);
  const h = useMemo(() => d + activeLang, [d, activeLang]);
  const n = useMemo(() => activeContent.split("\n").length, [activeContent]);
  return <div>{h}{n}</div>;
}

export function C2({ content }: { content: string }) {
  const n = useMemo(() => content.split("\n").length, [content]);
  return <div>{n}</div>;
}

export function C3({ tabs, activePath }: { tabs: Tab[]; activePath: string | null }) {
  const active = tabs.find((t) => t.path === activePath) ?? null;
  const activeContent = active?.content ?? "";
  const n = useMemo(() => activeContent.split("\n").length, [activeContent]);
  return <div>{n}</div>;
}
