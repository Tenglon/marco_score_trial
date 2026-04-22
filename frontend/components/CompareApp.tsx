"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, GitCompare, Loader2 } from "lucide-react";
import { fetchSearch } from "@/lib/api";
import type { Hit, SearchResponse } from "@/lib/types";
import { sanitizeHighlight } from "@/lib/highlight";

type Slot = "a" | "b";

const COLOR: Record<Slot, string> = {
  a: "#ab4323", // brick
  b: "#3a564b", // forest
};

export function CompareApp() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const initialA = sp.get("a") ?? "amsterdam";
  const initialB = sp.get("b") ?? "rotterdam";

  const [qA, setQA] = useState(initialA);
  const [qB, setQB] = useState(initialB);
  const [submittedA, setSubmittedA] = useState(initialA);
  const [submittedB, setSubmittedB] = useState(initialB);
  const [dataA, setDataA] = useState<SearchResponse | null>(null);
  const [dataB, setDataB] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const push = useCallback(
    (a: string, b: string) => {
      const u = new URLSearchParams();
      if (a) u.set("a", a);
      if (b) u.set("b", b);
      const qs = u.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      fetchSearch({ q: submittedA, size: 10, timelineInterval: 1 }, ctrl.signal),
      fetchSearch({ q: submittedB, size: 10, timelineInterval: 1 }, ctrl.signal),
    ])
      .then(([a, b]) => {
        setDataA(a);
        setDataB(b);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [submittedA, submittedB]);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-10 md:px-10 md:py-14">
      <header className="grain border-b border-ink pb-6">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-archive text-muted">
              Vol. 0 · № 1 · Query comparison
            </p>
            <h1 className="font-display text-5xl font-medium tracking-tight text-ink md:text-6xl">
              BEELDEN<span className="text-brick italic">compare</span>
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-snug text-ink-soft">
              Two queries on one timeline. A Single-Search-style Compare lens
              inspired by the CLARIAH Media Suite — useful for tracking how
              two topics rise and fall against each other across the archive.
            </p>
          </div>
          <nav className="hidden flex-col items-end gap-1 font-mono text-[11px] uppercase tracking-archive text-muted md:flex">
            <Link href="/" className="hover:text-brick">
              ← back to search
            </Link>
            <Link href="/visual" className="hover:text-brick">
              — visual
            </Link>
            <Link href="/entities" className="hover:text-brick">
              — entities
            </Link>
          </nav>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmittedA(qA.trim());
          setSubmittedB(qB.trim());
          push(qA.trim(), qB.trim());
        }}
        className="mt-8 grid gap-6 md:grid-cols-[1fr_auto_1fr]"
      >
        <QueryField slot="a" value={qA} onChange={setQA} />
        <button
          type="submit"
          className="flex h-10 shrink-0 items-center gap-2 self-end border border-ink bg-ink px-4 font-mono text-[11px] uppercase tracking-archive text-parchment transition hover:bg-brick hover:border-brick"
        >
          <GitCompare className="h-3.5 w-3.5" /> compare
        </button>
        <QueryField slot="b" value={qB} onChange={setQB} />
      </form>

      <section className="mt-8 space-y-3">
        <CountsRow
          a={dataA}
          b={dataB}
          loading={loading}
          error={error}
          submittedA={submittedA}
          submittedB={submittedB}
        />
        {dataA && dataB && (
          <OverlayTimeline a={dataA} b={dataB} labelA={submittedA} labelB={submittedB} />
        )}
      </section>

      <section className="mt-10 grid gap-10 md:grid-cols-2">
        <ResultColumn
          slot="a"
          label={submittedA}
          data={dataA}
          loading={loading}
        />
        <ResultColumn
          slot="b"
          label={submittedB}
          data={dataB}
          loading={loading}
        />
      </section>

      <footer className="mt-24 border-t border-ink pt-6 font-mono text-[11px] uppercase tracking-archive text-muted">
        § Inspired by CLARIAH Media Suite · Query Comparison
      </footer>
    </div>
  );
}

function QueryField({
  slot,
  value,
  onChange,
}: {
  slot: Slot;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span
        className="font-mono text-[11px] uppercase tracking-archive"
        style={{ color: COLOR[slot] }}
      >
        § query {slot.toUpperCase()}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border-b border-ink bg-transparent py-2 font-display text-2xl tracking-tight placeholder:text-muted placeholder:italic focus:outline-none"
        style={{ borderBottomColor: COLOR[slot] }}
      />
    </label>
  );
}

function CountsRow({
  a,
  b,
  loading,
  error,
  submittedA,
  submittedB,
}: {
  a: SearchResponse | null;
  b: SearchResponse | null;
  loading: boolean;
  error: string | null;
  submittedA: string;
  submittedB: string;
}) {
  if (error) {
    return <p className="font-mono text-[11px] text-brick">error: {error}</p>;
  }
  if (loading && (!a || !b)) {
    return (
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-archive text-ink-soft">
        <Loader2 className="h-3 w-3 animate-spin" /> comparing
      </p>
    );
  }
  if (!a || !b) return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule pb-2">
      <h2 className="flex items-baseline gap-4 font-display text-xl tracking-tight">
        <span style={{ color: COLOR.a }}>
          <span className="tabular">{a.total.toLocaleString()}</span>{" "}
          <span className="text-ink-soft">{submittedA || "—"}</span>
        </span>
        <span className="font-mono text-[11px] text-muted">vs</span>
        <span style={{ color: COLOR.b }}>
          <span className="tabular">{b.total.toLocaleString()}</span>{" "}
          <span className="text-ink-soft">{submittedB || "—"}</span>
        </span>
      </h2>
      <p className="tabular font-mono text-[11px] uppercase tracking-archive text-muted">
        {a.took_ms + b.took_ms} ms
      </p>
    </div>
  );
}

function OverlayTimeline({
  a,
  b,
  labelA,
  labelB,
}: {
  a: SearchResponse;
  b: SearchResponse;
  labelA: string;
  labelB: string;
}) {
  // Merge year axis
  const merged = useMemo(() => {
    const years = new Set<number>();
    for (const t of a.timeline) years.add(t.year);
    for (const t of b.timeline) years.add(t.year);
    const sorted = Array.from(years).sort((x, y) => x - y);
    const byYearA = new Map(a.timeline.map((t) => [t.year, t.doc_count]));
    const byYearB = new Map(b.timeline.map((t) => [t.year, t.doc_count]));
    const merged: Array<{ year: number; a: number; b: number }> = sorted.map((y) => ({
      year: y,
      a: byYearA.get(y) ?? 0,
      b: byYearB.get(y) ?? 0,
    }));
    const max = Math.max(
      1,
      ...merged.map((r) => Math.max(r.a, r.b)),
    );
    return { rows: merged, max };
  }, [a, b]);

  if (merged.rows.length === 0) return null;

  return (
    <section aria-label="overlay timeline" className="space-y-2">
      <header className="flex items-end justify-between font-mono text-[11px] uppercase tracking-archive text-muted">
        <span>§ Overlay · {merged.rows[0].year}—{merged.rows[merged.rows.length - 1].year}</span>
        <span className="flex items-center gap-4">
          <Swatch color={COLOR.a} label={labelA} />
          <Swatch color={COLOR.b} label={labelB} />
        </span>
      </header>
      <div
        className="relative flex h-28 items-end gap-[2px] border-b border-ink bg-parchment-deep/30 px-0"
        role="figure"
      >
        {merged.rows.map((r) => {
          const hA = r.a === 0 ? 0 : Math.max(3, (r.a / merged.max) * 92);
          const hB = r.b === 0 ? 0 : Math.max(3, (r.b / merged.max) * 92);
          return (
            <div
              key={r.year}
              title={`${r.year} · A=${r.a} · B=${r.b}`}
              className="relative flex h-full flex-1 items-end justify-center gap-[1px]"
            >
              <div
                className="w-[45%]"
                style={{ height: `${hA}%`, backgroundColor: COLOR.a }}
              />
              <div
                className="w-[45%]"
                style={{ height: `${hB}%`, backgroundColor: COLOR.b }}
              />
            </div>
          );
        })}
      </div>
      <div
        className="tabular flex justify-between font-mono text-[10px] text-muted"
        aria-hidden
      >
        <span>{merged.rows[0].year}</span>
        <span>
          {merged.rows[0].year +
            Math.floor(
              (merged.rows[merged.rows.length - 1].year - merged.rows[0].year) / 2,
            )}
        </span>
        <span>{merged.rows[merged.rows.length - 1].year}</span>
      </div>
    </section>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] normal-case tracking-tight text-ink-soft">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5"
        style={{ backgroundColor: color }}
      />
      {label || "—"}
    </span>
  );
}

function ResultColumn({
  slot,
  label,
  data,
  loading,
}: {
  slot: Slot;
  label: string;
  data: SearchResponse | null;
  loading: boolean;
}) {
  return (
    <div>
      <header
        className="mb-4 flex items-baseline justify-between border-b-2 pb-2"
        style={{ borderColor: COLOR[slot] }}
      >
        <h3 className="font-display text-xl tracking-tight text-ink">
          <span
            className="font-mono text-[10px] uppercase tracking-archive"
            style={{ color: COLOR[slot] }}
          >
            {slot.toUpperCase()} ·{" "}
          </span>
          {label || "—"}
        </h3>
        <p className="tabular font-mono text-[11px] text-muted">
          {data ? `${data.total} records` : "—"}
        </p>
      </header>
      {loading && !data ? (
        <p className="font-mono text-[11px] uppercase tracking-archive text-muted">
          loading
        </p>
      ) : (
        <ol className="space-y-4">
          {data?.hits.slice(0, 8).map((h, i) => (
            <CompactCard key={`${h.id}-${i}`} hit={h} rank={i + 1} />
          ))}
        </ol>
      )}
    </div>
  );
}

function CompactCard({ hit, rank }: { hit: Hit; rank: number }) {
  const titleHtml = sanitizeHighlight(hit.highlights.title?.[0] ?? hit.title);
  const descHtml =
    hit.highlights.description?.map(sanitizeHighlight).join(" … ") ??
    sanitizeHighlight(truncate(hit.description, 180));
  return (
    <li className="animate-rise grid grid-cols-[64px_1fr] gap-3 border-t border-rule pt-3">
      {hit.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={hit.thumbnail_url}
          alt=""
          loading="lazy"
          className="aspect-[4/3] w-full border border-ink object-cover"
        />
      ) : (
        <div className="aspect-[4/3] w-full border border-ink/20 bg-parchment-deep/50" />
      )}
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <a
            href={hit.source_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="group truncate font-display text-base font-medium leading-tight text-ink decoration-brick decoration-2 underline-offset-4 hover:underline"
          >
            <span dangerouslySetInnerHTML={{ __html: titleHtml }} />
            <ArrowUpRight className="ml-0.5 inline h-3 w-3 text-brick opacity-0 transition group-hover:opacity-100" />
          </a>
          <span className="tabular shrink-0 font-mono text-[10px] text-muted">
            № {String(rank).padStart(2, "0")} · {hit.year ?? "—"}
          </span>
        </div>
        <p
          className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink-soft"
          dangerouslySetInnerHTML={{ __html: descHtml }}
        />
      </div>
    </li>
  );
}

function truncate(s: string, n: number) {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + " …";
}
