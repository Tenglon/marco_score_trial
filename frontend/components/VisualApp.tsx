"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Image as ImageIcon, Loader2, Search, Sparkles, Upload } from "lucide-react";
import { mmImage, mmSimilar, mmText } from "@/lib/multimodal";
import type { Hit } from "@/lib/types";
import type { MultimodalResponse } from "@/lib/multimodal";
import { cn } from "@/lib/cn";

type Mode = "text" | "image" | "similar";

export function VisualApp() {
  const sp = useSearchParams();
  const initialId = sp.get("id") ?? "";
  const initialQ = sp.get("q") ?? "";

  const [mode, setMode] = useState<Mode>(initialId ? "similar" : "text");
  const [q, setQ] = useState(initialQ);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [data, setData] = useState<MultimodalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(
    async (signal?: AbortSignal) => {
      setError(null);
      setLoading(true);
      try {
        let r: MultimodalResponse;
        if (mode === "text" && q.trim()) {
          r = await mmText(q.trim(), 24, signal);
        } else if (mode === "image" && file) {
          r = await mmImage(file, 24, signal);
        } else if (mode === "similar" && initialId) {
          r = await mmSimilar(initialId, 24, signal);
        } else {
          setData(null);
          return;
        }
        setData(r);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [mode, q, file, initialId],
  );

  // Run on mount if we have an id or a query string
  useEffect(() => {
    const ctrl = new AbortController();
    if ((mode === "similar" && initialId) || (mode === "text" && q)) {
      run(ctrl.signal);
    }
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-10 md:px-10 md:py-14">
      <Masthead />

      <section className="mt-10 grid gap-10 lg:grid-cols-[360px_1fr]">
        <div className="space-y-8">
          <ModeSwitcher mode={mode} onChange={setMode} hasId={Boolean(initialId)} />

          {mode === "text" && (
            <TextPanel
              q={q}
              onChange={setQ}
              onSubmit={() => run()}
              loading={loading}
            />
          )}
          {mode === "image" && (
            <ImagePanel
              file={file}
              preview={filePreview}
              onFile={(f) => {
                setFile(f);
                if (f) setFilePreview(URL.createObjectURL(f));
                else setFilePreview(null);
              }}
              onSubmit={() => run()}
              loading={loading}
            />
          )}
          {mode === "similar" && (
            <SimilarPanel identifier={initialId} loading={loading} />
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <ResultsHeader data={data} loading={loading} error={error} />
          {data && data.hits.length > 0 ? (
            <Grid hits={data.hits} />
          ) : !loading && !error && (mode === "text" && !q) ? (
            <EmptyHint />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Masthead() {
  return (
    <header className="grain border-b border-ink pb-6">
      <div className="flex items-start justify-between gap-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-archive text-muted">
            Vol. 0 · № 1 · Visual / Multimodal
          </p>
          <h1 className="font-display text-5xl font-medium tracking-tight text-ink md:text-6xl">
            BEELDEN<span className="text-brick italic">visual</span>
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-snug text-ink-soft">
            A cross-modal reading glass — describe an image in words, drop in a
            picture, or find more like any record. Powered by{" "}
            <a
              className="underline decoration-brick decoration-2 underline-offset-2 hover:text-brick"
              href="https://github.com/mlfoundations/open_clip"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenCLIP
            </a>{" "}
            ViT-B/32 · LAION-2B.
          </p>
        </div>
        <nav className="hidden flex-col items-end gap-1 font-mono text-[11px] uppercase tracking-archive text-muted md:flex">
          <Link href="/" className="hover:text-brick">
            ← back to search
          </Link>
        </nav>
      </div>
    </header>
  );
}

function ModeSwitcher({
  mode,
  onChange,
  hasId,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  hasId: boolean;
}) {
  return (
    <div>
      <h2 className="mb-3 font-mono text-[11px] uppercase tracking-archive text-muted">
        § Query mode
      </h2>
      <ul className="grid grid-cols-3 gap-0 border border-ink">
        <ModeChip
          on={mode === "text"}
          onClick={() => onChange("text")}
          icon={<Search className="h-3.5 w-3.5" />}
          label="Text"
        />
        <ModeChip
          on={mode === "image"}
          onClick={() => onChange("image")}
          icon={<ImageIcon className="h-3.5 w-3.5" />}
          label="Image"
        />
        <ModeChip
          on={mode === "similar"}
          onClick={() => onChange("similar")}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Similar"
          disabled={!hasId}
        />
      </ul>
    </div>
  );
}

function ModeChip({
  on,
  onClick,
  icon,
  label,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-1.5 py-2.5 font-mono text-[11px] uppercase tracking-archive transition",
        on
          ? "bg-ink text-parchment"
          : "bg-parchment text-ink-soft hover:bg-parchment-deep/50",
        disabled && "cursor-not-allowed opacity-40 hover:bg-parchment",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function TextPanel({
  q,
  onChange,
  onSubmit,
  loading,
}: {
  q: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const suggestions = [
    "factory workers on a machine",
    "ships in a harbour",
    "wide cobblestone street with trams",
    "a group of people in dark coats",
    "men wearing hats outside a shop",
  ];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      <label className="block font-mono text-[11px] uppercase tracking-archive text-muted">
        Describe what you want to see
      </label>
      <textarea
        value={q}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="An empty Dutch street in the 1920s…"
        className="w-full resize-none border border-ink bg-parchment/60 px-4 py-3 font-display text-xl leading-snug text-ink placeholder:text-muted placeholder:italic focus:outline-none focus:ring-2 focus:ring-brick"
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className="font-mono text-[11px] text-ink-soft hover:text-brick"
          >
            {s}
          </button>
        ))}
      </div>
      <button
        type="submit"
        disabled={loading || !q.trim()}
        className="flex items-center gap-2 border border-ink bg-ink px-5 py-2.5 font-mono text-[11px] uppercase tracking-archive text-parchment transition hover:bg-brick hover:border-brick disabled:opacity-40"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        retrieve →
      </button>
    </form>
  );
}

function ImagePanel({
  file,
  preview,
  onFile,
  onSubmit,
  loading,
}: {
  file: File | null;
  preview: string | null;
  onFile: (f: File | null) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div className="space-y-4">
      <label className="block font-mono text-[11px] uppercase tracking-archive text-muted">
        Drop an image · any still from anywhere
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex aspect-[4/3] cursor-pointer items-center justify-center border-2 border-dashed transition",
          drag ? "border-brick bg-brick/5" : "border-rule bg-parchment-deep/30",
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-ink-soft">
            <Upload className="h-5 w-5" />
            <p className="font-mono text-[11px] uppercase tracking-archive">
              click or drag an image
            </p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          disabled={!file || loading}
          onClick={onSubmit}
          className="flex items-center gap-2 border border-ink bg-ink px-5 py-2.5 font-mono text-[11px] uppercase tracking-archive text-parchment transition hover:bg-brick hover:border-brick disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          retrieve →
        </button>
        {file && (
          <button
            onClick={() => onFile(null)}
            className="font-mono text-[11px] uppercase tracking-archive text-muted hover:text-brick"
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
}

function SimilarPanel({
  identifier,
  loading,
}: {
  identifier: string;
  loading: boolean;
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-mono text-[11px] uppercase tracking-archive text-muted">
        § Nearest neighbours
      </h3>
      <p className="text-[15px] leading-relaxed text-ink-soft">
        Showing records whose CLIP embedding is nearest to{" "}
        <span className="tabular font-mono text-[13px] text-ink">{identifier}</span>.
      </p>
      <p className="font-mono text-[11px] uppercase tracking-archive text-muted">
        {loading ? "ranking…" : "24 closest"}
      </p>
    </div>
  );
}

function ResultsHeader({
  data,
  loading,
  error,
}: {
  data: MultimodalResponse | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-3">
      <h2 className="flex items-baseline gap-3 font-display text-2xl font-medium tracking-tight">
        {loading ? (
          <span className="flex items-center gap-2 text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> retrieving
          </span>
        ) : error ? (
          <span className="text-brick">error: {error}</span>
        ) : data ? (
          <>
            <span className="tabular text-ink">{data.hits.length}</span>
            <span className="text-ink-soft">visual neighbours</span>
            <span className="font-mono text-[11px] font-normal uppercase tracking-archive text-muted">
              · mode {data.mode}
            </span>
          </>
        ) : (
          <span className="text-ink-soft">no query yet</span>
        )}
      </h2>
      {data && (
        <p className="tabular font-mono text-[11px] uppercase tracking-archive text-muted">
          {data.took_ms} ms
        </p>
      )}
    </div>
  );
}

function Grid({ hits }: { hits: Hit[] }) {
  return (
    <ol className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {hits.map((h, i) => (
        <VisualCard key={`${h.id}-${i}`} hit={h} rank={i + 1} />
      ))}
    </ol>
  );
}

function VisualCard({ hit, rank }: { hit: Hit; rank: number }) {
  return (
    <li
      className="animate-rise group relative border border-rule bg-parchment/50"
      style={{ animationDelay: `${Math.min(rank, 12) * 25}ms` }}
    >
      <a
        href={hit.source_url || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {hit.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hit.thumbnail_url}
            alt={hit.title}
            loading="lazy"
            className="aspect-[4/3] w-full border-b border-rule object-cover transition group-hover:opacity-90"
          />
        ) : (
          <div className="aspect-[4/3] w-full bg-parchment-deep/50" />
        )}
        <div className="space-y-1 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="tabular font-mono text-[10px] uppercase tracking-archive text-muted">
              № {String(rank).padStart(2, "0")}
            </span>
            <span className="tabular font-mono text-[10px] text-brick">
              {hit.score.toFixed(3)}
            </span>
          </div>
          <h3 className="line-clamp-2 font-display text-sm font-medium leading-tight text-ink">
            {hit.title}
            <ArrowUpRight className="ml-0.5 inline h-3 w-3 text-brick opacity-0 transition group-hover:opacity-100" />
          </h3>
          <p className="tabular font-mono text-[10px] text-muted">
            {hit.year ?? "—"}
          </p>
        </div>
      </a>
    </li>
  );
}

function EmptyHint() {
  return (
    <div className="border border-dashed border-rule px-6 py-16 text-center">
      <p className="font-display text-2xl tracking-tight text-ink-soft">
        Describe a scene in the input on the left.
      </p>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-archive text-muted">
        CLIP matches natural-language prompts to thumbnails in the archive.
      </p>
    </div>
  );
}
