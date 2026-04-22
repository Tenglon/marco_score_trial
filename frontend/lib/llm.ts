const BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

export interface ExpandResponse {
  original: string;
  alternatives: string[];
  model: string;
  took_ms: number;
}

export interface Citation {
  n: number;
  id: string;
  title: string;
  year: number | null;
}

export interface SummarizeResponse {
  query: string;
  bullets: string[];
  citations: Citation[];
  model: string;
  took_ms: number;
}

export async function llmExpand(
  q: string,
  n: number = 3,
  signal?: AbortSignal,
): Promise<ExpandResponse> {
  const r = await fetch(`${BASE}/llm/expand_query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q, n }),
    signal,
  });
  if (!r.ok) throw new Error(`expand failed: HTTP ${r.status}`);
  return (await r.json()) as ExpandResponse;
}

export async function llmSummarize(
  q: string,
  k: number = 10,
  signal?: AbortSignal,
): Promise<SummarizeResponse> {
  const r = await fetch(`${BASE}/llm/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q, k }),
    signal,
  });
  if (!r.ok) throw new Error(`summarize failed: HTTP ${r.status}`);
  return (await r.json()) as SummarizeResponse;
}
