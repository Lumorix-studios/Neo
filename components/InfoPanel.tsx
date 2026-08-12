import { openUrl } from "@tauri-apps/plugin-opener";
import PixelTransition from './PixelTransition';

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
              <h2 className="text-[15px] font-semibold text-[#f1f1eb] m-0">About & Contact</h2>
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
              <SectionLabel icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4a3 3 0 110 6 3 3 0 010-6zm0 14c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08A7.02 7.02 0 0112 20z" fill="currentColor"/>
                </svg>
              }>
                About
              </SectionLabel>

              <p className="text-[13px] text-[#a1a1aa] leading-relaxed m-0 mb-3.5">
                Made by{" "}
                <span className="text-[#f1f1eb] font-medium">Lumorix Studios</span>
                . A GitHub organization for our projects, not a registered company.
              </p>

              <ActionButton
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2A10 10 0 002 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"/>
                  </svg>
                }
                onClick={async () => {
                  try {
                    await openUrl("https://github.com/Lumorix-studios/AgenticCoder");
                  } catch (error) {
                    console.error("Failed to open URL:", error);
                  }
                }}
                label="View on GitHub"
                sublabel="Lumorix-studios/AgenticCoder"
                accent="green"
              />
            </Section>

            <Section>
              <SectionLabel icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" fill="currentColor"/>
                </svg>
              }>
                Contact
              </SectionLabel>

              <div className="flex flex-col gap-2">
                <ActionButton
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                    </svg>
                  }
                  onClick={async () => {
                    try {
                      await openUrl("mailto:madhusudhant207@gmail.com?subject=Inquiries");
                    } catch (error) {
                      console.error("Failed to open email:", error);
                    }
                  }}
                  label="Email"
                  sublabel="madhusudhant207@gmail.com"
                  accent="cream"
                />

                <ActionButton
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                    </svg>
                  }
                  onClick={async () => {
                    try {
                      await openUrl("tel:+17722590947");
                    } catch (error) {
                      console.error("Failed to open phone:", error);
                    }
                  }}
                  label="Phone"
                  sublabel="+1 (772) 259-0947"
                  accent="cream"
                />
              </div>
            </Section>
            (App uses components from reactbits.dev check them out lol)
            <PixelTransition
              firstContent={
                <img
                  src="../../src/assets/images/morph.jpg"
                  alt="default pixel transition content, a cat!"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              }
              secondContent={
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "grid",
                    placeItems: "center",
                    backgroundColor: "#111",
                  }}
                >
                  <p style={{ fontWeight: 900, fontSize: "1rem", color: "#ffffff" }}>Thanks for using the App!</p>
                </div>
              }
              gridSize={8}
              pixelColor="#ffffff"
              once={false}
              animationStepDuration={0.4}
              className="custom-pixel-card"
            />
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

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-3 text-[#777873] text-[11px] font-semibold uppercase tracking-wider">
      {icon}
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