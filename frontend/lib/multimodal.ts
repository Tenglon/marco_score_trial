import type { Hit } from "./types";

const BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

export interface MultimodalResponse {
  query: string;
  mode: "text" | "image" | "similar";
  k: number;
  took_ms: number;
  hits: Hit[];
}

export async function mmText(
  q: string,
  k: number,
  signal?: AbortSignal,
): Promise<MultimodalResponse> {
  const u = new URL(`${BASE}/multimodal_search`);
  u.searchParams.set("q", q);
  u.searchParams.set("k", String(k));
  const r = await fetch(u, { signal, cache: "no-store" });
  if (!r.ok) throw new Error(`multimodal_search failed: HTTP ${r.status}`);
  return (await r.json()) as MultimodalResponse;
}

export async function mmSimilar(
  identifier: string,
  k: number,
  signal?: AbortSignal,
): Promise<MultimodalResponse> {
  const fd = new FormData();
  fd.set("identifier", identifier);
  fd.set("k", String(k));
  const r = await fetch(`${BASE}/multimodal_search`, {
    method: "POST",
    body: fd,
    signal,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`multimodal_search failed: HTTP ${r.status}`);
  return (await r.json()) as MultimodalResponse;
}

export async function mmImage(
  file: File,
  k: number,
  signal?: AbortSignal,
): Promise<MultimodalResponse> {
  const fd = new FormData();
  fd.set("image", file);
  fd.set("k", String(k));
  const r = await fetch(`${BASE}/multimodal_search`, {
    method: "POST",
    body: fd,
    signal,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`multimodal_search failed: HTTP ${r.status}`);
  return (await r.json()) as MultimodalResponse;
}
