const BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

export interface GraphNode {
  text: string;
  label: string;
  count: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  label_pair: string;
}

export interface EntityGraphResponse {
  query: string;
  docs_scanned: number;
  total_matches: number;
  node_count: number;
  edge_count: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface EntityGraphParams {
  q: string;
  topN?: number;
  minWeight?: number;
  corpusCap?: number;
  yearFrom?: number;
  yearTo?: number;
  labels?: string[];
}

export async function fetchEntityGraph(
  p: EntityGraphParams,
  signal?: AbortSignal,
): Promise<EntityGraphResponse> {
  const u = new URL(`${BASE}/entity_graph`);
  if (p.q) u.searchParams.set("q", p.q);
  if (p.topN != null) u.searchParams.set("topN", String(p.topN));
  if (p.minWeight != null) u.searchParams.set("minWeight", String(p.minWeight));
  if (p.corpusCap != null) u.searchParams.set("corpusCap", String(p.corpusCap));
  if (p.yearFrom != null) u.searchParams.set("yearFrom", String(p.yearFrom));
  if (p.yearTo != null) u.searchParams.set("yearTo", String(p.yearTo));
  for (const l of p.labels ?? []) u.searchParams.append("labels", l);
  const r = await fetch(u, { signal, cache: "no-store" });
  if (!r.ok) throw new Error(`entity_graph failed: HTTP ${r.status}`);
  return (await r.json()) as EntityGraphResponse;
}
