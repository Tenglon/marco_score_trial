"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EntityGraphResponse, GraphEdge, GraphNode } from "@/lib/entities";
import { cn } from "@/lib/cn";

// react-force-graph-2d touches window at import time — must be dynamic-imported.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const LABEL_COLORS: Record<string, string> = {
  PERSON: "#ab4323", // brick
  GPE: "#3a564b",    // forest
  LOC: "#6b6456",    // warm grey
  ORG: "#c2883b",    // ochre
};

interface Props {
  data: EntityGraphResponse;
  onNodeClick?: (node: GraphNode) => void;
  height?: number;
}

interface FgNode extends GraphNode {
  id: string;
}

interface FgLink {
  source: string;
  target: string;
  weight: number;
  label_pair: string;
}

interface FgData {
  nodes: FgNode[];
  links: FgLink[];
}

export function EntityGraph({ data, onNodeClick, height = 560 }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(800);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setWidth(Math.floor(e.contentRect.width));
      }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo<FgData>(() => {
    const nodes: FgNode[] = data.nodes.map((n) => ({ ...n, id: n.text }));
    const present = new Set(nodes.map((n) => n.id));
    const links: FgLink[] = data.edges
      .filter((e: GraphEdge) => present.has(e.source) && present.has(e.target))
      .map((e) => ({ ...e }));
    return { nodes, links };
  }, [data]);

  const maxCount = Math.max(1, ...data.nodes.map((n) => n.count));
  const maxWeight = Math.max(1, ...data.edges.map((e) => e.weight));

  return (
    <div
      ref={wrapRef}
      className="relative w-full border border-rule bg-parchment/50"
      style={{ height }}
    >
      <ForceGraph2D
        graphData={graphData}
        width={width}
        height={height}
        backgroundColor="transparent"
        nodeRelSize={4}
        linkColor={(l) => {
          const w = (l as unknown as FgLink).weight;
          const alpha = 0.25 + 0.55 * (w / maxWeight);
          return `rgba(28, 24, 20, ${alpha.toFixed(2)})`;
        }}
        linkWidth={(l) => 0.6 + 1.6 * ((l as unknown as FgLink).weight / maxWeight)}
        onNodeClick={(n) => onNodeClick?.(n as unknown as GraphNode)}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const n = node as unknown as FgNode & { x: number; y: number };
          const radius = 3 + 9 * (n.count / maxCount);
          const color = LABEL_COLORS[n.label] ?? "#8e817a";
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.lineWidth = 1.2 / globalScale;
          ctx.strokeStyle = "rgba(28, 24, 20, 0.35)";
          ctx.stroke();

          const fontSize = Math.max(9, 12 / globalScale);
          ctx.font = `${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
          ctx.fillStyle = "#1c1814";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(`  ${n.text}`, n.x + radius, n.y);
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as unknown as FgNode & { x: number; y: number };
          const radius = 3 + 9 * (n.count / maxCount);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius + 4, 0, 2 * Math.PI);
          ctx.fill();
        }}
        cooldownTicks={200}
      />
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-3 bg-parchment/80 px-3 py-2 font-mono text-[10px] uppercase tracking-archive text-ink-soft backdrop-blur-sm">
      {Object.entries(LABEL_COLORS).map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Compact sidebar listing: top entities, top edges, selected node details. */
export function EntityPanel({
  data,
  selected,
  onSelect,
}: {
  data: EntityGraphResponse;
  selected: GraphNode | null;
  onSelect: (n: GraphNode | null) => void;
}) {
  return (
    <aside className="space-y-8 text-sm">
      <section>
        <h3 className="font-mono text-[11px] uppercase tracking-archive text-muted">
          § Top entities · {data.node_count}
        </h3>
        <div className="rule my-2" />
        <ul className="space-y-1.5">
          {data.nodes.slice(0, 18).map((n) => (
            <li key={n.text}>
              <button
                onClick={() => onSelect(selected?.text === n.text ? null : n)}
                className={cn(
                  "group flex w-full items-baseline justify-between gap-3 text-left leading-tight transition",
                  selected?.text === n.text
                    ? "text-brick"
                    : "text-ink-soft hover:text-ink",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: LABEL_COLORS[n.label] ?? "#8e817a" }}
                  />
                  {n.text}
                </span>
                <span className="tabular font-mono text-[11px] text-muted">
                  {n.count}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-mono text-[11px] uppercase tracking-archive text-muted">
          § Co-occurrences · {data.edge_count}
        </h3>
        <div className="rule my-2" />
        <ul className="space-y-1.5">
          {data.edges.slice(0, 12).map((e, i) => (
            <li
              key={`${e.source}-${e.target}-${i}`}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="truncate text-ink-soft">
                {e.source}{" "}
                <span className="text-muted">→</span> {e.target}
              </span>
              <span className="tabular font-mono text-[11px] text-brick">
                {e.weight}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
