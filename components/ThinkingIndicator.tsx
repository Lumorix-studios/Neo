import type { CSSProperties } from "react";

interface ThinkingIndicatorProps {
  label?: string;
  className?: string;
}

export default function ThinkingIndicator({
  label = "Thinking",
  className = "",
}: ThinkingIndicatorProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`pointer-events-none select-none inline-flex items-center gap-1.5 ${className}`}
    >
      <span aria-hidden="true" className="inline-flex items-center gap-0.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1 w-1 rounded-full bg-current opacity-40 animate-pulse"
            style={{ animationDelay: `${index * 140}ms` } as CSSProperties}
          />
        ))}
      </span>
      {label && <span>{label}</span>}
    </span>
  );
}
