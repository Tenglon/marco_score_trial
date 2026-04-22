"use client";

import { X } from "lucide-react";
import type { Bucket, FacetName, SearchResponse } from "@/lib/types";
import { cn } from "@/lib/cn";

const FACET_ORDER: { name: FacetName; label: string }[] = [
  { name: "subject", label: "Subject" },
  { name: "creator", label: "Creator" },
  { name: "publisher", label: "Publisher" },
  { name: "type", label: "Media type" },
  { name: "license", label: "License" },
  { name: "set_spec", label: "Collection" },
  { name: "language", label: "Language" },
];

interface Props {
  facets: SearchResponse["facets"];
  active: Partial<Record<FacetName, string[]>>;
  onToggle: (facet: FacetName, value: string) => void;
  onClear: () => void;
}

export function Facets({ facets, active, onToggle, onClear }: Props) {
  const anyActive = Object.values(active).some((xs) => xs && xs.length > 0);

  return (
    <aside className="space-y-8 md:sticky md:top-8 md:max-h-[calc(100vh-4rem)] md:overflow-auto md:pr-3">
      <header className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-archive text-muted">
          § Refine
        </h2>
        {anyActive && (
          <button
            onClick={onClear}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-archive text-brick hover:underline"
          >
            clear <X className="h-3 w-3" />
          </button>
        )}
      </header>

      {FACET_ORDER.map(({ name, label }) => {
        const buckets = facets[name] ?? [];
        if (buckets.length === 0) return null;
        const selected = active[name] ?? [];
        return (
          <FacetBlock
            key={name}
            label={label}
            buckets={buckets}
            selected={selected}
            onToggle={(v) => onToggle(name, v)}
          />
        );
      })}
    </aside>
  );
}

interface BlockProps {
  label: string;
  buckets: Bucket[];
  selected: string[];
  onToggle: (v: string) => void;
}

function FacetBlock({ label, buckets, selected, onToggle }: BlockProps) {
  const shown = buckets.slice(0, 8);
  return (
    <div>
      <h3 className="mb-2 font-display text-[15px] font-medium tracking-tight text-ink">
        {label}
      </h3>
      <div className="rule mb-3" />
      <ul className="space-y-1.5">
        {shown.map((b) => {
          const active = selected.includes(b.key);
          return (
            <li key={b.key}>
              <button
                onClick={() => onToggle(b.key)}
                className={cn(
                  "group flex w-full items-baseline justify-between gap-3 text-left text-sm leading-tight transition",
                  active ? "text-brick" : "text-ink-soft hover:text-ink",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-[2px] h-3 w-3 shrink-0 border transition",
                      active
                        ? "border-brick bg-brick"
                        : "border-ink-soft/60 bg-transparent group-hover:border-ink",
                    )}
                  />
                  <span className="break-words">{b.key || "—"}</span>
                </span>
                <span className="tabular font-mono text-[11px] text-muted">
                  {b.doc_count.toLocaleString()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {buckets.length > shown.length && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-archive text-muted">
          + {buckets.length - shown.length} more
        </p>
      )}
    </div>
  );
}
