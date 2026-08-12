import { useState } from "react";

interface Tab2Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function Tab2({ isOpen, onClose }: Tab2Props) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md bg-[#10110f] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c9f2d6] text-[#152219]">
              <span className="text-[15px] font-bold">★</span>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#f1f1eb] m-0">Rate us</h2>
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

        <div className="px-5 py-6">
          <p className="text-[13px] text-[#a1a1aa] leading-relaxed m-0 mb-5">
            Enjoying the app? Tap a star to rate your experience.
          </p>

          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
                className="p-1 transition-transform hover:scale-110"
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill={(hover || rating) >= star ? "#c9f2d6" : "none"}
                  stroke={(hover || rating) >= star ? "#c9f2d6" : "#777873"}
                  strokeWidth="1.5"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
            ))}
          </div>

          {rating > 0 && (
            <p className="text-center text-[12px] text-[#c9f2d6] mt-4 m-0">
              Thanks for the {rating}-star rating!
            </p>
          )}
        </div>

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