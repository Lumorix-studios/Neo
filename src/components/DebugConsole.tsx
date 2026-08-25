/**
 * Debug console: evaluates JavaScript/Node expressions against the workspace
 * using the system `node` runtime. Code is base64-wrapped so it survives the
 * PowerShell round-trip untouched, and async code is awaited automatically.
 */
import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IoBan, IoSend } from "react-icons/io5";
import { logToBus } from "./logBus";

interface DebugConsoleProps {
  root: string | null;
}

interface EvalResult {
  expr: string;
  output: string;
  ok: boolean;
  time: number;
}

interface RunResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

/** Wrap user code so awaits work, results print, and errors are caught. */
function wrap(code: string): string {
  return (
    "Promise.resolve().then(async () => {\n" +
    `${code}\n` +
    "}).then(v => { if (v !== undefined) console.log('=>', v); })" +
    ".catch(e => { console.error(String(e && e.stack || e)); " +
    "process.exitCode = 1; });"
  );
}

export default function DebugConsole({ root }: DebugConsoleProps) {
  const [expr, setExpr] = useState("");
  const [history, setHistory] = useState<EvalResult[]>([]);
  const [running, setRunning] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const evaluate = useCallback(
    async (code: string) => {
      if (!code.trim() || running) return;
      setRunning(true);
      try {
        // Base64 the source so quotes/newlines can't break the shell layer.
        const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(wrap(code))));
        let res: RunResult;
        if (!root) {
          res = await invoke<RunResult>("run_command", {
            command: `node -e 'eval(Buffer.from("${b64}","base64").toString())'`,
            timeout_secs: 30,
          });
        } else {
          res = await invoke<RunResult>("run_command", {
            command: `node -e 'eval(Buffer.from("${b64}","base64").toString())'`,
            cwd: root,
            timeout_secs: 30,
          });
        }
        const output =
          [res.stdout, res.stderr].filter((s) => s.trim()).join("\n").trim() ||
          (res.timedOut ? "(timed out after 30 s)" : "(no output)");
        setHistory((prev) => [
          ...prev.slice(-100),
          { expr: code, output, ok: res.exitCode === 0 && !res.timedOut, time: Date.now() },
        ]);
        logToBus("Debug Console", `> ${code}\n${output}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setHistory((prev) => [
          ...prev.slice(-100),
          { expr: code, output: msg, ok: false, time: Date.now() },
        ]);
      } finally {
        setRunning(false);
      }
    },
    [root, running]
  );

  return (
    <div className="flex h-full flex-col">
      {/* History */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-5 scrollbar-thin">
        {history.length === 0 && (
          <p className="text-[11px] leading-5 text-[#6b6b6b]">
            Evaluate Node.js expressions in the workspace — async/await works.
            <br />
            e.g. <span className="text-[#8a8a93]">await fetch('https://api.github.com').then(r =&gt; r.status)</span>
          </p>
        )}
        {history.map((h, i) => (
          <div key={`${h.time}-${i}`} className="mb-2 border-b border-white/[0.04] pb-1.5 last:border-0">
            <p className="whitespace-pre-wrap break-all text-[#7ea6ff]">
              <span className="select-none text-[#6b6b6b]">❯ </span>
              {h.expr}
            </p>
            <pre
              className={`whitespace-pre-wrap break-all ${
                h.ok ? "text-zinc-300" : "text-[#e5534b]"
              }`}
            >
              {h.output}
            </pre>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex shrink-0 items-center gap-1.5 border-t border-white/[0.07] px-2.5 py-1.5">
        <span className="shrink-0 font-mono text-[13px] text-[#6b6b6b]">❯</span>
        <input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              const code = expr;
              setExpr("");
              void evaluate(code);
            }
          }}
          placeholder={running ? "Evaluating…" : "Node.js expression…"}
          spellCheck={false}
          autoCapitalize="off"
          className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-[#ececec] outline-none placeholder:text-[#5a5a62]"
        />
        <button
          type="button"
          onClick={() => setHistory([])}
          disabled={history.length === 0}
          title="Clear console"
          aria-label="Clear console"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#8a8a93] transition hover:bg-white/[0.06] hover:text-[#ececec] disabled:pointer-events-none disabled:opacity-40"
        >
          <IoBan size={12} />
        </button>
        <button
          type="button"
          onClick={() => {
            const code = expr;
            setExpr("");
            void evaluate(code);
          }}
          disabled={!expr.trim() || running}
          title="Evaluate (Enter)"
          aria-label="Evaluate"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#2563eb] text-white transition hover:bg-[#3b76f5] disabled:bg-white/[0.05] disabled:text-[#5a5a62]"
        >
          <IoSend size={11} />
        </button>
      </div>
    </div>
  );
}

