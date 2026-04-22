"use client";

import { ChevronDown, Loader2, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useState } from "react";
import {
  llmExpand,
  llmSummarize,
  type Citation,
  type ExpandResponse,
  type SummarizeResponse,
} from "@/lib/llm";
import { cn } from "@/lib/cn";

interface Props {
  q: string;
  onApplyAlternative: (q: string) => void;
}

export function LlmPanel({ q, onApplyAlternative }: Props) {
  const [open, setOpen] = useState(false);
  const [expand, setExpand] = useState<ExpandResponse | null>(null);
  const [summary, setSummary] = useState<SummarizeResponse | null>(null);
  const [busyExpand, setBusyExpand] = useState(false);
  const [busySumm, setBusySumm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasQ = q.trim().length > 0;

  const runExpand = useCallback(async () => {
    if (!hasQ) return;
    setError(null);
    setBusyExpand(true);
    try {
      const r = await llmExpand(q, 3);
      setExpand(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyExpand(false);
    }
  }, [q, hasQ]);

  const runSummarize = useCallback(async () => {
    if (!hasQ) return;
    setError(null);
    setBusySumm(true);
    try {
      const r = await llmSummarize(q, 10);
      setSummary(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusySumm(false);
    }
  }, [q, hasQ]);

  return (
    <section
      aria-label="LLM panel"
      className="border border-ink/60"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 bg-ink px-4 py-3 text-left text-parchment"
      >
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-archive">
          <Sparkles className="h-3.5 w-3.5 text-ochre" />
          LLM assistant
          <span className="rounded border border-parchment/30 px-1.5 py-0.5 text-[9px] tracking-[0.22em]">
            experimental
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform",
            open && "-rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-8 bg-parchment/40 p-5">
          <Block
            title="Rewrite the query"
            hint="Open-source LLM suggests alternative phrasings (NL + EN) to improve recall."
          >
            <div className="flex items-center gap-3">
              <button
                disabled={!hasQ || busyExpand}
                onClick={runExpand}
                className="flex items-center gap-2 border border-ink bg-parchment px-3 py-1.5 font-mono text-[11px] uppercase tracking-archive text-ink transition hover:border-brick hover:text-brick disabled:opacity-40"
              >
                {busyExpand ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                expand query
              </button>
              {expand && (
                <span className="tabular font-mono text-[10px] text-muted">
                  {expand.took_ms} ms · {expand.model.split("/").pop()}
                </span>
              )}
            </div>
            {expand && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {expand.alternatives.map((a) => (
                  <li key={a}>
                    <button
                      onClick={() => onApplyAlternative(a)}
                      className="group flex items-baseline gap-1.5 border border-ink/40 bg-parchment px-2.5 py-1 text-sm text-ink-soft transition hover:border-brick hover:text-brick"
                    >
                      <span className="font-mono text-[10px] text-muted group-hover:text-brick">
                        →
                      </span>
                      {a}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block
            title="Summarize top results"
            hint="Summary is grounded in the 10 top-ranked records; every claim is citation-tagged."
          >
            <div className="flex items-center gap-3">
              <button
                disabled={!hasQ || busySumm}
                onClick={runSummarize}
                className="flex items-center gap-2 border border-ink bg-parchment px-3 py-1.5 font-mono text-[11px] uppercase tracking-archive text-ink transition hover:border-brick hover:text-brick disabled:opacity-40"
              >
                {busySumm ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                summarize
              </button>
              {summary && (
                <span className="tabular font-mono text-[10px] text-muted">
                  {summary.took_ms} ms · {summary.model.split("/").pop()} · {summary.citations.length}{" "}
                  citation{summary.citations.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {summary && (
              <div className="mt-4 space-y-3">
                <ul className="space-y-3">
                  {summary.bullets.map((b, i) => (
                    <li
                      key={i}
                      className="relative flex gap-3 border-l-2 border-brick pl-3 text-[15px] leading-relaxed text-ink"
                    >
                      <span className="mt-0.5 font-mono text-[10px] uppercase tracking-archive text-brick">
                        §{i + 1}
                      </span>
                      <RenderBullet
                        text={b}
                        citations={summary.citations}
                      />
                    </li>
                  ))}
                </ul>
                {summary.citations.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-archive text-muted hover:text-brick">
                      § citation index ({summary.citations.length})
                    </summary>
                    <ul className="mt-2 space-y-1 pl-2 text-[13px] text-ink-soft">
                      {summary.citations.map((c) => (
                        <li key={c.n} className="flex items-baseline gap-2">
                          <span className="tabular font-mono text-[10px] text-brick">
                            [{c.n}]
                          </span>
                          <span className="text-ink">{c.title}</span>
                          <span className="tabular font-mono text-[10px] text-muted">
                            {c.year ?? "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </Block>

          {error && (
            <p className="border border-brick bg-brick/5 p-2 font-mono text-[11px] text-brick">
              error: {error}
            </p>
          )}

          <p className="border-t border-rule pt-3 font-mono text-[10px] leading-relaxed text-muted">
            § note · runs locally on ollama/qwen2.5:7b-instruct by default.
            Switch to any OpenAI-compatible endpoint via <code>LLM_MODEL</code>{" "}
            and <code>LLM_BASE_URL</code> env vars. The model only sees records
            retrieved above; it does not browse the internet.
          </p>
        </div>
      )}
    </section>
  );
}

function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-display text-lg font-medium tracking-tight text-ink">
        {title}
      </h3>
      <p className="mb-3 max-w-prose text-[13px] text-ink-soft">{hint}</p>
      {children}
    </div>
  );
}

function RenderBullet({
  text,
  citations,
}: {
  text: string;
  citations: Citation[];
}) {
  // Replace [n] with a hoverable/clickable chip
  const byN = new Map(citations.map((c) => [c.n, c]));
  const parts: React.ReactNode[] = [];
  const re = /\[(\d+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const n = Number(m[1]);
    const c = byN.get(n);
    parts.push(
      <sup key={`${m.index}-${n}`} className="mx-0.5">
        <button
          title={c ? `${c.title} (${c.year ?? "?"})` : `cite ${n}`}
          className="rounded-sm border border-brick bg-brick/5 px-1 font-mono text-[9px] tracking-tight text-brick"
        >
          {n}
        </button>
      </sup>,
    );
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span>{parts}</span>;
}
