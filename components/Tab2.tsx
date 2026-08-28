import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useErrorHandler } from "../src/errorContext";

interface Tab2Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function Tab2({ isOpen, onClose }: Tab2Props) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  void setRating;
  const { reportError } = useErrorHandler();

  const openFeedback = async () => {
    try {
      await openUrl("mailto:madhusudhant207@gmail.com");
    } catch (error) {
      reportError(error);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/[0.09] bg-[var(--bg-elevated)] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2 className="m-0 text-[14px] font-semibold text-[#ececec]">Rate Neo</h2>
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
        <div className="px-5 py-6">
          <p className="m-0 mb-5 text-[12.5px] leading-relaxed text-[#a3a3a3]">
            Enjoying the app? Tap a star to rate your experience.
          </p>

          <div className="flex items-center justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => {
                  setRating(star);
                  void openFeedback();
                }}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
                aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                className="p-1 transition-transform hover:scale-110"
              >
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill={(hover || rating) >= star ? "#ececec" : "none"}
                  stroke={(hover || rating) >= star ? "#ececec" : "#555555"}
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
            ))}
          </div>

          {rating > 0 && (
            <p className="m-0 mt-4 text-center text-[11.5px] text-[#6b6b6b]">
              Thanks for the {rating}-star rating!
            </p>
          )}
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