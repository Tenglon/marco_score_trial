"use client";

import { ArrowUpRight, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Hit } from "@/lib/types";
import { sanitizeHighlight } from "@/lib/highlight";

interface Props {
  hit: Hit;
  rank: number;
}

export function ResultCard({ hit, rank }: Props) {
  const titleHtml = sanitizeHighlight(hit.highlights.title?.[0] ?? hit.title);
  const descHtml =
    hit.highlights.description?.map(sanitizeHighlight).join(" … ") ??
    sanitizeHighlight(truncate(hit.description, 240));

  return (
    <article
      className="animate-rise grid grid-cols-[88px_1fr] gap-x-5 gap-y-2 border-t border-rule/80 pt-6 md:grid-cols-[160px_1fr]"
      style={{ animationDelay: `${Math.min(rank, 10) * 35}ms` }}
    >
      <div className="col-span-1 row-span-2 flex flex-col gap-2">
        {hit.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hit.thumbnail_url}
            alt=""
            loading="lazy"
            className="aspect-[4/3] w-full border border-ink bg-ink object-cover"
          />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center border border-ink/20 bg-parchment-deep/50 font-mono text-[10px] text-muted">
            no preview
          </div>
        )}
        <span className="tabular font-mono text-[10px] uppercase tracking-archive text-muted">
          № {String(rank).padStart(3, "0")}
        </span>
      </div>

      <header className="col-span-1 flex items-baseline justify-between gap-4">
        <a
          href={hit.source_url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="group font-display text-2xl font-medium leading-tight tracking-tight text-ink decoration-brick decoration-2 underline-offset-4 hover:underline"
        >
          <span dangerouslySetInnerHTML={{ __html: titleHtml }} />
          <ArrowUpRight className="ml-1 inline h-4 w-4 -translate-y-1 text-brick opacity-60 transition group-hover:opacity-100" />
        </a>
        <span className="tabular shrink-0 font-mono text-[11px] uppercase tracking-archive text-ink-soft">
          {hit.year ?? "—"}
        </span>
      </header>

      <div className="col-span-1 space-y-3">
        <p
          className="max-w-[65ch] text-[15px] leading-relaxed text-ink-soft"
          dangerouslySetInnerHTML={{ __html: descHtml }}
        />

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-archive text-muted">
          {hit.creator.length > 0 && (
            <>
              <dt>creator</dt>
              <dd className="text-ink-soft normal-case tracking-normal">
                {hit.creator.slice(0, 2).join("; ")}
              </dd>
            </>
          )}
          {hit.subject.length > 0 && (
            <>
              <dt>subjects</dt>
              <dd className="flex flex-wrap gap-1.5 text-ink-soft normal-case tracking-normal">
                {hit.subject.slice(0, 6).map((s) => (
                  <span
                    key={s}
                    className="border border-rule bg-parchment-deep/30 px-1.5 py-0.5 text-[11px]"
                  >
                    {s}
                  </span>
                ))}
              </dd>
            </>
          )}
          {hit.license && (
            <>
              <dt>license</dt>
              <dd className="truncate text-ink-soft normal-case tracking-normal">
                <a
                  href={hit.license}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brick"
                >
                  {prettyLicense(hit.license)}
                </a>
              </dd>
            </>
          )}
          {hit.archive_id && (
            <>
              <dt>archive id</dt>
              <dd className="tabular text-ink-soft tracking-normal">
                {hit.archive_id}
              </dd>
            </>
          )}
        </dl>

        <Link
          href={`/visual?id=${encodeURIComponent(hit.id)}`}
          className="inline-flex items-center gap-1.5 border border-ink/30 bg-transparent px-2.5 py-1 font-mono text-[10px] uppercase tracking-archive text-ink-soft transition hover:border-brick hover:text-brick"
        >
          <Sparkles className="h-3 w-3" />
          similar images
        </Link>
      </div>
    </article>
  );
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(" ")) + " …";
}

function prettyLicense(url: string): string {
  const m = url.match(/creativecommons\.org\/(licenses|publicdomain)\/([^/]+)(?:\/([\d.]+))?/i);
  if (!m) return url;
  const kind = m[1] === "publicdomain" ? "Public Domain" : `CC ${m[2].toUpperCase()}`;
  return m[3] ? `${kind} ${m[3]}` : kind;
}
