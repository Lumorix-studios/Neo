import { openUrl } from "@tauri-apps/plugin-opener";

interface InfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InfoPanel({ isOpen, onClose }: InfoPanelProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg flex flex-col overflow-hidden bg-[#10110f] border border-white/[0.08] rounded-2xl shadow-2xl max-h-[82vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c9f2d6] text-[#152219]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 8v1M12 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#f1f1eb] m-0">Privacy Policies</h2>
              <p className="text-[12px] text-[#777873] m-0">Lumorix Studios</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-[#777873] transition hover:bg-white/[0.06] hover:text-[#f1f1eb]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-3">
            <Section>
              <ActionButton
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2A10 10 0 002 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"/>
                  </svg>
                }
                onClick={async () => {
                  try {
                    await openUrl("https://github.com/Lumorix-studios/Neo/blob/main/PRIVACYPOLICY.MD");
                  } catch (error) {
                    console.error("Failed to open URL:", error);
                  }
                }}
                label="View our Policies GitHub"
                sublabel="If you have any concerns upon our policies please contact us"
                accent="green"
              />
            </Section>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-3.5 border-t border-white/[0.08]">
          <span className="text-[11px] text-[#777873]">© 2026 Lumorix Studios</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#c9f2d6] text-[#152219] text-[13px] font-semibold transition hover:opacity-85"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.025] border border-white/[0.06] rounded-xl p-4">
      {children}
    </div>
  );
}

function ActionButton({
  icon,
  onClick,
  label,
  sublabel,
  accent,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  label: string;
  sublabel: string;
  accent: "green" | "cream";
}) {
  const accentColor = accent === "green" ? "#c9f2d6" : "#f1f1eb";

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3.5 py-2.5 bg-transparent border border-white/[0.07] rounded-lg cursor-pointer transition-all text-left hover:bg-white/[0.04] hover:border-white/[0.12]"
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
        style={{
          background: `${accentColor}18`,
          border: `1px solid ${accentColor}30`,
          color: accentColor,
        }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[#d4d4d8]">{label}</div>
        <div className="text-[12px] mt-0.5 truncate" style={{ color: accentColor }}>
          {sublabel}
        </div>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        className="text-[#777873] flex-shrink-0"
      >
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