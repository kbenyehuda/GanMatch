"use client";

import { cn } from "@/lib/utils";

function StarSvg({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

export function StarRating({
  value,
  count,
  className,
  starClassName,
  showValue = true,
}: {
  value: number | null | undefined;
  count?: number | null | undefined;
  className?: string;
  starClassName?: string;
  showValue?: boolean;
}) {
  const v = typeof value === "number" && isFinite(value) ? Math.max(0, Math.min(5, value)) : null;
  const c = typeof count === "number" && isFinite(count) ? count : null;

  const stars = Array.from({ length: 5 }, (_, i) => {
    const fill = v == null ? 0 : Math.max(0, Math.min(1, v - i));
    const pct = Math.round(fill * 100);
    return (
      <span key={i} className="relative inline-block h-4 w-4">
        <StarSvg
          className={cn(
            "absolute inset-0 h-4 w-4 fill-none stroke-gray-300 stroke-[1.6]",
            starClassName
          )}
        />
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        >
          <StarSvg
            className={cn(
              "h-4 w-4 fill-amber-400 stroke-amber-500 stroke-[0.8]",
              starClassName
            )}
          />
        </span>
      </span>
    );
  });

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center gap-0.5" aria-label={v == null ? "No ratings" : `Rating ${v} out of 5`}>
        {stars}
      </div>
      {showValue && (
        <div className="text-xs text-gray-600 font-hebrew">
          {v == null || (c != null && c === 0) ? (
            <span>אין דירוג</span>
          ) : (
            <>
              <span className="font-semibold text-gan-dark">{v.toFixed(1)}</span>
              {c != null ? <span className="text-gray-500">{` (${c})`}</span> : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

