import { IoClose } from "react-icons/io5";

interface Props {
  onClose: () => void;
}

export default function ChatSidebar({ onClose }: Props) {
  return (
    <div className="flex h-full w-full flex-col bg-[#10110f] text-[#f1f1eb]">
      <header className="flex h-12 items-center gap-2 border-b border-white/[0.08] px-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#c9f2d6] text-[#152219]">
          <span className="text-[13px] font-bold">◈</span>
        </div>

        <span className="text-[12px] font-semibold tracking-tight">Sidebar</span>

        <div className="flex-1" />

        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[#777873] transition hover:bg-white/[0.06] hover:text-[#f1f1eb]"
        >
          <IoClose size={16} />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex h-full flex-col justify-center px-5 py-8">
          <div className="mb-8">
            <div className="mb-4 text-[11px] uppercase tracking-[0.18em] text-[#777873]">
              Sidebar
            </div>

            <h1 className="max-w-[300px] text-[26px] font-semibold leading-8 tracking-[-0.04em] text-[#f1f1eb]">
              Your sidebar
            </h1>

            <p className="mt-3 max-w-[310px] text-[12px] leading-5 text-[#777873]">
              This is a blank sidebar frame. Build whatever you want here.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}