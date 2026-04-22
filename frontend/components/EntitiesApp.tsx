"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Network } from "lucide-react";
import { fetchEntityGraph } from "@/lib/entities";
import type { EntityGraphResponse, GraphNode } from "@/lib/entities";
import { EntityGraph, EntityPanel } from "./EntityGraph";

export function EntitiesApp() {
  const sp = useSearchParams();
  const initialQ = sp.get("q") ?? "";

  const [q, setQ] = useState(initialQ);
  const [submitted, setSubmitted] = useState(initialQ);
  const [data, setData] = useState<EntityGraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [minWeight, setMinWeight] = useState(2);
  const [topN, setTopN] = useState(30);

  const run = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      fetchEntityGraph({ q: submitted, topN, minWeight }, signal)
        .then((d) => {
          setData(d);
        })
        .catch((e: unknown) => {
          if ((e as Error).name !== "AbortError") setError((e as Error).message);
        })
        .finally(() => setLoading(false));
    },
    [submitted, topN, minWeight],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    run(ctrl.signal);
    return () => ctrl.abort();
  }, [run]);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-10 md:px-10 md:py-14">
      <header className="grain border-b border-ink pb-6">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-archive text-muted">
              Vol. 0 · № 1 · Entity lens
            </p>
            <h1 className="font-display text-5xl font-medium tracking-tight text-ink md:text-6xl">
              BEELDEN<span className="text-brick italic">network</span>
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-snug text-ink-soft">
              Who appears with whom, and where. A co-occurrence graph over
              PERSON / GPE / LOC / ORG entities extracted from archive titles,
              descriptions and abstracts with spaCy NL — computed live over
              whatever records match your query.
            </p>
          </div>
          <nav className="hidden flex-col items-end gap-1 font-mono text-[11px] uppercase tracking-archive text-muted md:flex">
            <Link href="/" className="hover:text-brick">
              ← back to search
            </Link>
            <Link href="/visual" className="hover:text-brick">
              — visual
            </Link>
          </nav>
        </div>
      </header>

      <section className="mt-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(q.trim());
          }}
          className="flex flex-col gap-3 md:flex-row md:items-end"
        >
          <div className="flex-1">
            <label className="block font-mono text-[11px] uppercase tracking-archive text-muted">
              Corpus filter
            </label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="empty = whole archive — try amsterdam OR rotterdam"
              className="w-full border-b border-ink bg-transparent py-2 font-display text-2xl tracking-tight placeholder:text-muted placeholder:italic focus:outline-none"
            />
          </div>
          <Slider
            label={`top-N = ${topN}`}
            value={topN}
            min={10}
            max={60}
            step={5}
            onChange={setTopN}
          />
          <Slider
            label={`min weight = ${minWeight}`}
            value={minWeight}
            min={1}
            max={6}
            step={1}
            onChange={setMinWeight}
          />
          <button
            type="submit"
            className="flex shrink-0 items-center gap-2 border border-ink bg-ink px-4 py-2.5 font-mono text-[11px] uppercase tracking-archive text-parchment transition hover:bg-brick hover:border-brick"
          >
            <Network className="h-3.5 w-3.5" /> rebuild graph
          </button>
        </form>
      </section>

      <section className="mt-6 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-2">
            <h2 className="flex items-baseline gap-3 font-display text-xl font-medium tracking-tight">
              {loading ? (
                <span className="flex items-center gap-2 text-ink-soft">
                  <Loader2 className="h-4 w-4 animate-spin" /> computing graph
                </span>
              ) : error ? (
                <span className="text-brick">error: {error}</span>
              ) : data ? (
                <>
                  <span className="tabular text-ink">{data.node_count}</span>
                  <span className="text-ink-soft">nodes</span>
                  <span className="font-mono text-[11px] font-normal text-muted">
                    · {data.edge_count} edges
                  </span>
                  <span className="font-mono text-[11px] font-normal uppercase tracking-archive text-muted">
                    · {data.docs_scanned} / {data.total_matches} docs
                  </span>
                </>
              ) : null}
            </h2>
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="font-mono text-[11px] uppercase tracking-archive text-ink-soft hover:text-brick"
              >
                clear selection
              </button>
            )}
          </header>

          {data && <EntityGraph data={data} onNodeClick={setSelected} />}

          {selected && (
            <SelectedCard node={selected} q={submitted} />
          )}
        </div>

        {data && (
          <EntityPanel data={data} selected={selected} onSelect={setSelected} />
        )}
      </section>

      <footer className="mt-24 border-t border-ink pt-6 font-mono text-[11px] uppercase tracking-archive text-muted">
        Powered by spaCy nl_core_news_md · computed live from the current
        corpus filter
      </footer>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex min-w-[150px] flex-col">
      <span className="font-mono text-[11px] uppercase tracking-archive text-muted">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-brick"
      />
    </label>
  );
}

function SelectedCard({ node, q }: { node: GraphNode; q: string }) {
  const filter = q ? `${q} AND "${node.text}"` : `"${node.text}"`;
  const href = `/?q=${encodeURIComponent(filter)}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border border-brick bg-brick/5 px-4 py-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-archive text-brick">
          § Selected · {node.label} · {node.count} doc
          {node.count === 1 ? "" : "s"}
        </p>
        <p className="font-display text-xl tracking-tight text-ink">{node.text}</p>
      </div>
      <Link
        href={href}
        className="flex items-center gap-2 border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-archive text-parchment transition hover:bg-brick hover:border-brick"
      >
        see records →
      </Link>
    </div>
  );
}
