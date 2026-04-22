"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  value: string;
  onSubmit: (q: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onSubmit, placeholder }: Props) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(draft.trim());
      }}
      className="group relative"
    >
      <div className="flex items-center gap-4 border-b border-ink pb-3">
        <Search
          className="h-5 w-5 shrink-0 text-ink-soft transition group-focus-within:text-brick"
          aria-hidden
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            placeholder ??
            "amsterdam AND havens, stad*, “van Berkel”…"
          }
          className="w-full bg-transparent font-display text-3xl tracking-tight placeholder:text-muted placeholder:italic focus:outline-none md:text-4xl"
          aria-label="Search Openbeelden"
          autoFocus
        />
        <button
          type="submit"
          className="shrink-0 border border-ink bg-ink px-4 py-2 text-xs uppercase tracking-archive text-parchment transition hover:bg-brick hover:border-brick"
        >
          Search →
        </button>
      </div>
      <div className="mt-1 flex h-[3px] w-full items-stretch gap-[2px]" aria-hidden>
        <div className="flex-1 bg-ink/70" />
        <div className="w-[25%] bg-brick" />
        <div className="w-[10%] bg-ochre" />
      </div>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        Operators: AND · OR · NOT · &ldquo;phrase&rdquo; · wild* · (group)
      </p>
    </form>
  );
}
