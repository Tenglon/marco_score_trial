"use client";

import { useMemo } from "react";
import type { TimelineBucket } from "@/lib/types";
import { cn } from "@/lib/cn";

interface Props {
  buckets: TimelineBucket[];
  yearFrom?: number;
  yearTo?: number;
  onBrush?: (from: number, to: number) => void;
  onClear?: () => void;
}

export function Timeline({ buckets, yearFrom, yearTo, onBrush, onClear }: Props) {
  const cleaned = useMemo(
    () => buckets.filter((b) => Number.isFinite(b.year)),
    [buckets],
  );
  if (cleaned.length === 0) return null;

  const max = Math.max(...cleaned.map((b) => b.doc_count), 1);
  const totalYears = cleaned.length;
  const minYear = cleaned[0].year;
  const maxYear = cleaned[cleaned.length - 1].year;

  const active = yearFrom != null || yearTo != null;

  return (
    <section aria-label="Year distribution" className="space-y-2">
      <header className="flex items-end justify-between font-mono text-[11px] uppercase tracking-archive text-muted">
        <span>§ Timeline · {minYear}—{maxYear}</span>
        <span className="flex items-center gap-3">
          {active && (
            <span className="text-brick">
              filter: {yearFrom ?? minYear}–{yearTo ?? maxYear}
            </span>
          )}
          {active && onClear && (
            <button onClick={onClear} className="hover:underline">
              clear
            </button>
          )}
          <span>n = {totalYears}</span>
        </span>
      </header>
      <div
        className="relative flex h-24 items-end gap-[1px] border-b border-ink bg-parchment-deep/30 px-0"
        role="figure"
      >
        {cleaned.map((b) => {
          const h = b.doc_count === 0 ? 2 : Math.max(3, (b.doc_count / max) * 92);
          const inSelection =
            (yearFrom == null || b.year >= yearFrom) &&
            (yearTo == null || b.year <= yearTo);
          return (
            <button
              key={b.year}
              onClick={() => onBrush?.(b.year, b.year)}
              title={`${b.year} · ${b.doc_count}`}
              className={cn(
                "relative flex-1 cursor-pointer transition hover:bg-brick",
                b.doc_count === 0 ? "bg-rule/60" : "bg-ink",
                active && !inSelection && "opacity-20",
              )}
              style={{ height: `${h}%` }}
              aria-label={`${b.year}: ${b.doc_count} records`}
            />
          );
        })}
      </div>
      <div
        className="tabular flex justify-between font-mono text-[10px] text-muted"
        aria-hidden
      >
        <span>{minYear}</span>
        <span>
          {minYear + Math.floor((maxYear - minYear) / 2)}
        </span>
        <span>{maxYear}</span>
      </div>
    </section>
  );
}
