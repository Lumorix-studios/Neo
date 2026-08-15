interface ErrorTabProps {
  isOpen: boolean;
  onClose: () => void;
}

import Noise from '../components/Noise'

export default function ErrorTab({ isOpen, onClose }: ErrorTabProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md bg-[#10110f] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/20 text-red-400">
              <span className="text-[15px] font-bold">!</span>
            </div>
            <div>
              <div style={{width: '600px', height: '400px', position: 'relative', overflow: 'hidden'}}>
                <Noise
                  patternSize={250}
                  patternScaleX={2}
                  patternScaleY={2}
                  patternRefreshInterval={2}
                  patternAlpha={15}
                />
              </div>
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

        {/* Empty tab body — intentionally blank */}
        <div className="px-5 py-6 min-h-[200px]" />

        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.08]">
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