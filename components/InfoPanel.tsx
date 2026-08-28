import { openUrl } from "@tauri-apps/plugin-opener";
import { useErrorHandler } from "../src/errorContext";

interface InfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InfoPanel({ isOpen, onClose }: InfoPanelProps) {
  const { reportError } = useErrorHandler();
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-white/[0.09] bg-[var(--bg-elevated)] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2 className="m-0 text-[14px] font-semibold text-[#ececec]">About & Contact</h2>
            <p className="m-0 text-[11.5px] text-[#6b6b6b]">Lumorix Studios</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec]"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-5">
            <Section title="About">
              <p className="m-0 mb-3.5 text-[12.5px] leading-relaxed text-[#a3a3a3]">
                Made by{" "}
                <span className="font-medium text-[#ececec]">Lumorix Studios</span>. A
                GitHub organization for projects, not a registered company.
              </p>

              <ActionButton
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2A10 10 0 002 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" />
                  </svg>
                }
                onClick={async () => {
                  try {
                    await openUrl("https://github.com/Lumorix-studios/Neo.git");
                  } catch (error) {
                    reportError(error);
                  }
                }}
                label="View on GitHub"
                sublabel="Lumorix-studios/AgenticCoder"
              />
            </Section>

            <Section title="Contact">
              <div className="flex flex-col gap-2">
                <ActionButton
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M22 7l-10 6L2 7" />
                    </svg>
                  }
                  onClick={async () => {
                    try {
                      await openUrl("mailto:madhusudhant207@gmail.com?subject=Inquiries");
                    } catch (error) {
                      reportError(error);
                    }
                  }}
                  label="Email"
                  sublabel="madhusudhant207@gmail.com"
                />

                <ActionButton
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" />
                    </svg>
                  }
                  onClick={async () => {
                    try {
                      await openUrl("tel:+17722590947");
                    } catch (error) {
                      reportError(error);
                    }
                  }}
                  label="Phone"
                  sublabel="+1 (772) 259-0947"
                />
              </div>
            </Section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-3">
          <span className="text-[10.5px] text-[#6b6b6b]">© 2026 Lumorix Studios</span>
          <button
            onClick={onClose}
            className="rounded-md bg-[#ececec] px-3.5 py-1.5 text-[12px] font-semibold text-[#111111] transition hover:bg-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#6b6b6b]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ActionButton({
  icon,
  onClick,
  label,
  sublabel,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  label: string;
  sublabel: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left transition-all hover:border-white/[0.13] hover:bg-white/[0.04]"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[#a3a3a3]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-[#d4d4d4]">{label}</div>
        <div className="mt-0.5 truncate text-[11.5px] text-[#6b6b6b]">{sublabel}</div>
      </div>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[#6b6b6b]">
        <path
          d="M7 17L17 7M17 7H7M17 7v10"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}