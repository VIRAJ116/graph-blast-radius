import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { LINK_COLORS, nodeColor, nodeRadius } from '../../lib/colors.js';

/**
 * Force-directed graph view, shared by every screen.
 *
 * Each feature supplies its own `{ nodes, links }` and its own highlight set;
 * nothing about blast radius, paths or SPOFs is known here. That is what makes
 * one canvas component enough for four screens.
 *
 * Two implementation details are worth knowing before changing this file:
 *
 *   1. The layout engine mutates the node objects it is given, writing x/y
 *      coordinates onto them. Passing a freshly-built array on every render
 *      therefore restarts the simulation and makes the graph jump. The data is
 *      memoised on a caller-supplied `dataKey` so the simulation only restarts
 *      when the underlying query result actually changed.
 *
 *   2. The canvas has no layout of its own — it needs explicit pixel
 *      dimensions. A ResizeObserver on the wrapper supplies them so the graph
 *      fills whatever space the page gives it.
 */
export function GraphCanvas({
  nodes,
  links,
  dataKey,
  highlightedIds,
  onNodeClick,
  height = 520,
  emptyMessage = 'Nothing to display yet.',
}) {
  const wrapperRef = useRef(null);
  const graphRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height });
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      // Only commit a genuinely different width. Setting a fresh object on
      // every observation re-renders the canvas for no reason, and a re-render
      // that nudges layout can feed the observer again.
      setSize((previous) => (previous.width === width ? previous : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [height]);

  // Cloned so the layout engine's coordinate writes never mutate the objects
  // held in the caller's state.
  const graphData = useMemo(
    () => ({
      nodes: nodes.map((node) => ({ ...node })),
      links: links.map((link) => ({ ...link })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataKey],
  );

  const highlighted = useMemo(() => new Set(highlightedIds ?? []), [highlightedIds]);

  /**
   * Frames the graph.
   *
   * Called from `onEngineStop` rather than on a timer: fitting while the
   * simulation is still spreading nodes out measures a layout that is about to
   * change, which leaves small graphs sitting in the middle of a mostly empty
   * canvas. The timer below is only a fallback for the case where the engine
   * never reports stopping.
   */
  const fitToView = useCallback(() => {
    graphRef.current?.zoomToFit(500, 48);
  }, []);

  // The simulation keeps contracting for a while after the first frames, so a
  // single fit lands on a layout that is still moving and leaves a small graph
  // marooned in the middle of the canvas. Re-fitting a few times as it settles
  // costs nothing and is what makes small result sets fill the space.
  useEffect(() => {
    if (graphData.nodes.length === 0) return undefined;
    const timers = [400, 1200, 2400].map((delay) => setTimeout(fitToView, delay));
    return () => timers.forEach(clearTimeout);
  }, [graphData, fitToView]);

  const paintNode = useCallback(
    (node, ctx, globalScale) => {
      const radius = nodeRadius(node);
      const color = nodeColor(node);
      const isHighlighted = highlighted.has(node.id);
      const isHovered = hoveredId === node.id;

      if (isHighlighted || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI);
        ctx.fillStyle = `${color}33`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      if (isHighlighted || isHovered) {
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      // Labels only once zoomed in, or for nodes the user is meant to notice.
      // Drawing every label at every zoom turns the view into a grey smear.
      const showLabel = globalScale > 1.6 || isHovered || node.impact === 'failed';
      if (!showLabel) return;

      const fontSize = Math.max(9 / globalScale, 2.2);
      ctx.font = `${fontSize}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const label = node.name ?? node.id;
      const padding = 2 / globalScale;
      const textWidth = ctx.measureText(label).width;

      ctx.fillStyle = 'rgba(11, 17, 32, 0.82)';
      ctx.fillRect(
        node.x - textWidth / 2 - padding,
        node.y + radius + padding,
        textWidth + padding * 2,
        fontSize + padding,
      );

      ctx.fillStyle = isHovered ? '#f8fafc' : '#cbd5e1';
      ctx.fillText(label, node.x, node.y + radius + padding * 1.5);
    },
    [highlighted, hoveredId],
  );

  const linkColor = useCallback(
    (link) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      if (highlighted.has(sourceId) && highlighted.has(targetId)) return LINK_COLORS.highlighted;
      return LINK_COLORS[link.kind] ?? LINK_COLORS.default;
    },
    [highlighted],
  );

  if (nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed
          border-surface-border bg-surface-base/40 text-xs text-slate-500"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="overflow-hidden rounded-lg border border-surface-border bg-surface-base/60"
      style={{ height }}
    >
      {size.width > 0 && (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={size.width}
          height={height}
          backgroundColor="rgba(0,0,0,0)"
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, nodeRadius(node) + 3, 0, 2 * Math.PI);
            ctx.fill();
          }}
          nodeLabel={(node) =>
            `<div style="font:12px ui-monospace,monospace;color:#e2e8f0">
               ${node.name ?? node.id}<br/>
               <span style="color:#94a3b8">${node.role ?? ''}${node.siteName ? ` · ${node.siteName}` : ''}</span>
             </div>`
          }
          linkColor={linkColor}
          linkWidth={(link) => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            return highlighted.has(sourceId) && highlighted.has(targetId) ? 2.2 : 1;
          }}
          onNodeHover={(node) => setHoveredId(node?.id ?? null)}
          onNodeClick={onNodeClick}
          onEngineStop={fitToView}
          cooldownTicks={90}
          d3VelocityDecay={0.28}
          warmupTicks={20}
        />
      )}
    </div>
  );
}
