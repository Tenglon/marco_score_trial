import type { SearchParams, SearchResponse } from "./types";

const BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

/**
 * Build a URL for the /search endpoint, skipping empty values. Arrays
 * serialize as repeated keys (`subject=havens&subject=grachten`) which FastAPI
 * decodes natively.
 */
export function buildSearchUrl(params: SearchParams): string {
  const u = new URL(`${BASE}/search`);
  const set = (k: string, v: string | number | undefined | null) => {
    if (v === undefined || v === null || v === "") return;
    u.searchParams.set(k, String(v));
  };
  set("q", params.q);
  set("size", params.size);
  set("offset", params.offset);
  set("sort", params.sort);
  set("yearFrom", params.yearFrom);
  set("yearTo", params.yearTo);
  set("timelineInterval", params.timelineInterval);
  for (const [k, vs] of Object.entries(params.facets ?? {})) {
    for (const v of vs) u.searchParams.append(k, v);
  }
  return u.toString();
}

export async function fetchSearch(
  params: SearchParams,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const res = await fetch(buildSearchUrl(params), {
    signal,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`search failed: HTTP ${res.status}`);
  }
  return (await res.json()) as SearchResponse;
}
