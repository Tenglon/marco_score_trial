export interface Hit {
  id: string;
  title: string;
  description: string;
  abstract: string;
  date: string;
  year: number | null;
  creator: string[];
  subject: string[];
  publisher: string[];
  spatial: string[];
  type: string;
  license: string;
  thumbnail_url: string | null;
  source_url: string;
  archive_id: string;
  score: number;
  highlights: Record<string, string[]>;
}

export interface Bucket {
  key: string;
  doc_count: number;
}

export interface TimelineBucket {
  year: number;
  doc_count: number;
}

export interface SearchResponse {
  query: string;
  total: number;
  took_ms: number;
  hits: Hit[];
  facets: Record<string, Bucket[]>;
  timeline: TimelineBucket[];
}

export type FacetName =
  | "creator"
  | "subject"
  | "publisher"
  | "type"
  | "license"
  | "set_spec"
  | "language";

export interface SearchParams {
  q: string;
  size?: number;
  offset?: number;
  sort?: "relevance" | "date_desc" | "date_asc";
  yearFrom?: number;
  yearTo?: number;
  timelineInterval?: number;
  facets?: Partial<Record<FacetName, string[]>>;
}
