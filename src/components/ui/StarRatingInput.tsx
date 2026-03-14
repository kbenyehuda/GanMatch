"use client";

import { useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

function StarSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

export function StarRatingInput({
  value,
  onChange,
  disabled,
  className,
  label,
}: {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const display = hover ?? value ?? 0;
  const handleClick = useCallback(
    (v: number) => {
      onChange(v);
      setHover(null);
    },
    [onChange]
  );
  const segments = useMemo(() => Array.from({ length: 10 }, (_, i) => (i + 1) / 2), []);

  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      {label ? <div className="text-xs text-gray-600 font-hebrew">{label}</div> : null}
      <div
        className={cn("flex items-center gap-1 isolate", disabled ? "opacity-60" : "")}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const fill = Math.max(0, Math.min(1, display - i));
          const pct = Math.round(fill * 100);
          return (
            <div key={i} className="relative h-6 w-6 shrink-0">
              <StarSvg className="absolute inset-0 h-6 w-6 fill-none stroke-gray-300 stroke-[1.6]" />
              <div
                className="absolute inset-0 overflow-hidden pointer-events-none"
                style={{ width: `${pct}%` }}
              >
                <StarSvg className="h-6 w-6 fill-amber-400 stroke-amber-500 stroke-[0.8]" />
              </div>

              {/* Two click targets per star (half increments) - above fill layer, no overlap */}
              <button
                type="button"
                disabled={disabled}
                className="absolute top-0 bottom-0 left-0 w-1/2 z-20 cursor-pointer appearance-none bg-transparent border-0 p-0 m-0"
                aria-label={`${i + 0.5} כוכבים`}
                onMouseEnter={() => setHover(i + 0.5)}
                onFocus={() => setHover(i + 0.5)}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleClick(i + 0.5);
                }}
                onClick={() => handleClick(i + 0.5)}
              />
              <button
                type="button"
                disabled={disabled}
                className="absolute top-0 bottom-0 left-1/2 w-1/2 z-20 cursor-pointer appearance-none bg-transparent border-0 p-0 m-0"
                aria-label={`${i + 1} כוכבים`}
                onMouseEnter={() => setHover(i + 1)}
                onFocus={() => setHover(i + 1)}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleClick(i + 1);
                }}
                onClick={() => handleClick(i + 1)}
              />
            </div>
          );
        })}
        <span className="ms-2 min-w-[2rem] text-xs text-gray-600 font-hebrew tabular-nums">
          {value == null && hover == null ? "—" : display.toFixed(1)}
        </span>
      </div>

      {/* keyboard-friendly fallback */}
      <div className="sr-only">
        <label>
          {label ?? "rating"}
          <select
            value={value ?? 0.5}
            onChange={(e) => onChange(Number(e.target.value))}
            disabled={disabled}
          >
            {segments.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

