"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { fetchSearch } from "@/lib/api";
import type { FacetName, SearchParams, SearchResponse } from "@/lib/types";
import { SearchBar } from "./SearchBar";
import { Facets } from "./Facets";
import { Timeline } from "./Timeline";
import { ResultCard } from "./ResultCard";
import { LlmPanel } from "./LlmPanel";

const FACET_KEYS: FacetName[] = [
  "creator",
  "subject",
  "publisher",
  "type",
  "license",
  "set_spec",
  "language",
];

function readParams(sp: URLSearchParams): SearchParams {
  const facets: SearchParams["facets"] = {};
  for (const key of FACET_KEYS) {
    const all = sp.getAll(key);
    if (all.length > 0) facets[key] = all;
  }
  const num = (k: string): number | undefined => {
    const v = sp.get(k);
    return v ? Number(v) : undefined;
  };
  return {
    q: sp.get("q") ?? "",
    size: num("size") ?? 20,
    offset: num("offset") ?? 0,
    sort: (sp.get("sort") as SearchParams["sort"]) ?? "relevance",
    yearFrom: num("yearFrom"),
    yearTo: num("yearTo"),
    timelineInterval: num("timelineInterval") ?? 1,
    facets,
  };
}

function writeParams(p: SearchParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.size && p.size !== 20) sp.set("size", String(p.size));
  if (p.offset) sp.set("offset", String(p.offset));
  if (p.sort && p.sort !== "relevance") sp.set("sort", p.sort);
  if (p.yearFrom) sp.set("yearFrom", String(p.yearFrom));
  if (p.yearTo) sp.set("yearTo", String(p.yearTo));
  for (const [k, vs] of Object.entries(p.facets ?? {})) {
    for (const v of vs) sp.append(k, v);
  }
  return sp;
}

export function SearchApp() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useMemo(() => readParams(searchParams), [searchParams]);

  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startTransition] = useTransition();
  const [firstLoad, setFirstLoad] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    startTransition(() => {
      fetchSearch(params, ctrl.signal)
        .then((d) => {
          setData(d);
          setError(null);
          setFirstLoad(false);
        })
        .catch((e: unknown) => {
          if ((e as Error).name !== "AbortError") {
            setError((e as Error).message);
            setFirstLoad(false);
          }
        });
    });
    return () => ctrl.abort();
  }, [params]);

  const push = useCallback(
    (next: SearchParams) => {
      const sp = writeParams(next);
      const qs = sp.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const onQuery = useCallback(
    (q: string) => push({ ...params, q, offset: 0 }),
    [push, params],
  );

  const onToggleFacet = useCallback(
    (facet: FacetName, value: string) => {
      const cur = new Set(params.facets?.[facet] ?? []);
      if (cur.has(value)) cur.delete(value);
      else cur.add(value);
      const nextFacets = { ...(params.facets ?? {}) };
      if (cur.size === 0) delete nextFacets[facet];
      else nextFacets[facet] = Array.from(cur);
      push({ ...params, facets: nextFacets, offset: 0 });
    },
    [push, params],
  );

  const onClearFacets = useCallback(
    () => push({ ...params, facets: {}, yearFrom: undefined, yearTo: undefined, offset: 0 }),
    [push, params],
  );

  const onBrushTimeline = useCallback(
    (from: number, to: number) =>
      push({ ...params, yearFrom: from, yearTo: to, offset: 0 }),
    [push, params],
  );

  const onClearTimeline = useCallback(
    () => push({ ...params, yearFrom: undefined, yearTo: undefined, offset: 0 }),
    [push, params],
  );

  const appliedFacets = params.facets ?? {};
  const totalApplied =
    Object.values(appliedFacets).reduce((acc, xs) => acc + (xs?.length ?? 0), 0) +
    (params.yearFrom || params.yearTo ? 1 : 0);

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-10 md:px-10 md:py-14">
      <Masthead />

      <section className="mt-12 md:mt-16">
        <SearchBar value={params.q} onSubmit={onQuery} />
        <SuggestedQueries onPick={onQuery} active={params.q} />
      </section>

      <section className="mt-10 grid gap-10 md:grid-cols-[240px_1fr]">
        <div className="order-2 md:order-1">
          {data && (
            <Facets
              facets={data.facets}
              active={appliedFacets}
              onToggle={onToggleFacet}
              onClear={onClearFacets}
            />
          )}
        </div>

        <div className="order-1 min-w-0 space-y-8 md:order-2">
          {data && (
            <Timeline
              buckets={data.timeline}
              yearFrom={params.yearFrom}
              yearTo={params.yearTo}
              onBrush={onBrushTimeline}
              onClear={onClearTimeline}
            />
          )}

          <LlmPanel q={params.q} onApplyAlternative={onQuery} />

          <ResultsHeader
            total={data?.total ?? 0}
            took={data?.took_ms ?? 0}
            applied={totalApplied}
            loading={loading || firstLoad}
            error={error}
          />

          {error ? null : data?.hits.length === 0 ? (
            <EmptyState q={params.q} />
          ) : (
            <ol className="space-y-10">
              {data?.hits.map((h, i) => (
                <ResultCard key={`${h.id}-${i}`} hit={h} rank={i + 1 + (params.offset ?? 0)} />
              ))}
            </ol>
          )}

          {data && data.total > (params.size ?? 20) && (
            <Pagination
              total={data.total}
              size={params.size ?? 20}
              offset={params.offset ?? 0}
              onGo={(off) => push({ ...params, offset: off })}
            />
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Masthead() {
  return (
    <header className="grain border-b border-ink pb-6">
      <div className="flex items-start justify-between gap-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-archive text-muted">
            Vol. 0 · № 1 · Amsterdam
          </p>
          <h1 className="font-display text-5xl font-medium tracking-tight text-ink md:text-7xl">
            BEELDEN<span className="text-brick italic">search</span>
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-snug text-ink-soft">
            An experimental reading-room for Dutch audiovisual heritage — drawn
            from the{" "}
            <a
              href="https://www.openbeelden.nl/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-brick decoration-2 underline-offset-2 hover:text-brick"
            >
              Openbeelden
            </a>{" "}
            archive, wrapped in a Single-Search-alike.
          </p>
        </div>
        <nav className="hidden flex-col items-end gap-1 font-mono text-[11px] uppercase tracking-archive text-muted md:flex">
          <span className="text-ink">Search</span>
          <a className="hover:text-brick" href="/visual">
            — visual
          </a>
          <a className="hover:text-brick" href="/entities">
            — entities
          </a>
          <a className="hover:text-brick" href="/compare">
            — compare
          </a>
          <span className="text-ink">— llm (inline)</span>
        </nav>
      </div>
    </header>
  );
}

interface ResultsHeaderProps {
  total: number;
  took: number;
  applied: number;
  loading: boolean;
  error: string | null;
}

function ResultsHeader({ total, took, applied, loading, error }: ResultsHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-3">
      <h2 className="flex items-baseline gap-3 font-display text-2xl font-medium tracking-tight">
        {loading ? (
          <span className="flex items-center gap-2 text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> searching
          </span>
        ) : error ? (
          <span className="text-brick">error: {error}</span>
        ) : (
          <>
            <span className="tabular text-ink">{total.toLocaleString()}</span>
            <span className="text-ink-soft">
              record{total === 1 ? "" : "s"}
            </span>
          </>
        )}
      </h2>
      <p className="tabular font-mono text-[11px] uppercase tracking-archive text-muted">
        {applied > 0 && <span className="text-brick">{applied} filter · </span>}
        {took} ms
      </p>
    </div>
  );
}

interface PaginationProps {
  total: number;
  size: number;
  offset: number;
  onGo: (offset: number) => void;
}

function Pagination({ total, size, offset, onGo }: PaginationProps) {
  const page = Math.floor(offset / size) + 1;
  const pages = Math.ceil(total / size);
  const prev = Math.max(0, offset - size);
  const next = Math.min((pages - 1) * size, offset + size);
  const atStart = page === 1;
  const atEnd = page === pages;
  return (
    <nav
      aria-label="pagination"
      className="flex items-center justify-between border-t border-ink pt-6"
    >
      <button
        disabled={atStart}
        onClick={() => onGo(prev)}
        className="font-mono text-xs uppercase tracking-archive text-ink-soft disabled:opacity-30 hover:text-brick"
      >
        ← previous
      </button>
      <span className="tabular font-mono text-[11px] uppercase tracking-archive text-muted">
        page {page} / {pages}
      </span>
      <button
        disabled={atEnd}
        onClick={() => onGo(next)}
        className="font-mono text-xs uppercase tracking-archive text-ink-soft disabled:opacity-30 hover:text-brick"
      >
        next →
      </button>
    </nav>
  );
}

function EmptyState({ q }: { q: string }) {
  return (
    <div className="border border-dashed border-rule px-6 py-16 text-center">
      <p className="font-display text-3xl tracking-tight text-ink-soft">
        No records for{" "}
        <em className="text-brick">&ldquo;{q || "your query"}&rdquo;</em>.
      </p>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-archive text-muted">
        Try a broader term, drop a facet, or widen the year range.
      </p>
    </div>
  );
}

const SUGGESTED = [
  "amsterdam",
  "havens",
  "fabriek*",
  "jeugd",
  "koningin",
  '"van Berkel"',
  "rotterdam AND straat*",
];

function SuggestedQueries({
  onPick,
  active,
}: {
  onPick: (q: string) => void;
  active: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="font-mono text-[10px] uppercase tracking-archive text-muted">
        Try
      </span>
      {SUGGESTED.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className={`font-mono text-xs tracking-tight transition ${
            active === s
              ? "text-brick underline decoration-2 underline-offset-4"
              : "text-ink-soft hover:text-brick"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-ink pt-6 font-mono text-[11px] uppercase tracking-archive text-muted">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span>
          Data · Openbeelden (Netherlands Institute for Sound &amp; Vision, CC)
        </span>
        <span>
          Built for ASCoR · Multimodal Toolbox interview · 2026
        </span>
      </div>
    </footer>
  );
}
