import React, { useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import { useApi } from '../../hooks/useApi.js';
import {
  Card, Select, Button, Badge, ErrorState, EmptyState, LoadingState, Stat,
} from '../../components/ui/index.jsx';
import { GraphCanvas } from '../../components/graph/GraphCanvas.jsx';
import { GraphLegend } from '../../components/graph/GraphLegend.jsx';
import { RoleBadge } from '../../components/DeviceChip.jsx';
import { formatDuration, formatNumber, pluralise, roleLabel } from '../../lib/format.js';

/**
 * Path finder.
 *
 * "How do these two talk to each other, and what happens if one hop dies?"
 *
 * The verdict is the point of the screen. Four distinct routes that all cross
 * the same aggregation router is not redundancy, and only a search that
 * explicitly avoids each hop reveals that.
 */
const HOP_OPTIONS = [2, 3, 4, 5, 6, 7, 8].map((value) => ({
  value: String(value),
  label: `${value} hops`,
}));

export function PathFinderPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [maxHops, setMaxHops] = useState('6');
  const [submitted, setSubmitted] = useState(null);

  const devices = useApi(({ signal }) => api.devices({ limit: 400 }, { signal }), []);

  const deviceOptions = useMemo(
    () =>
      (devices.data?.devices ?? []).map((device) => ({
        value: device.id,
        label: `${device.name} — ${roleLabel(device.role)} · ${device.siteName}`,
      })),
    [devices.data],
  );

  const result = useApi(
    ({ signal }) => api.paths(submitted, { signal }),
    [submitted],
    { enabled: Boolean(submitted) },
  );

  const canSubmit = from && to && from !== to;

  return (
    <div className="space-y-5">
      <Card
        title="Pick two devices"
        subtitle="Any pair — the search walks the physical link graph between them."
      >
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
          <Select
            label="From"
            value={from}
            onChange={setFrom}
            options={deviceOptions}
            placeholder={devices.loading ? 'Loading devices…' : 'Select a device'}
            disabled={devices.loading}
          />
          <Select
            label="To"
            value={to}
            onChange={setTo}
            options={deviceOptions}
            placeholder={devices.loading ? 'Loading devices…' : 'Select a device'}
            disabled={devices.loading}
          />
          <Select label="Max depth" value={maxHops} onChange={setMaxHops} options={HOP_OPTIONS} />
          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={() => setSubmitted({ from, to, maxHops })}
          >
            Find routes
          </Button>
        </div>

        {from && to && from === to && (
          <p className="mt-3 text-xs text-orange-300">Pick two different devices.</p>
        )}

        {devices.error && (
          <div className="mt-3">
            <ErrorState error={devices.error} onRetry={devices.refetch} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-[11px] text-slate-500">Try:</span>
          {[
            { from: 'acc-cok-01', to: 'core-mum-01', label: 'Kochi access → Mumbai core' },
            { from: 'core-del-01', to: 'core-maa-01', label: 'Delhi core → Chennai core' },
            { from: 'acc-mum-01', to: 'acc-del-01', label: 'Mumbai access → Delhi access' },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setFrom(preset.from);
                setTo(preset.to);
                setSubmitted({ from: preset.from, to: preset.to, maxHops });
              }}
              className="rounded-md bg-surface-raised px-2 py-1 text-[11px] text-slate-400
                ring-1 ring-inset ring-surface-border transition-colors
                hover:bg-slate-700/60 hover:text-slate-200"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </Card>

      {!submitted && (
        <Card>
          <EmptyState
            icon="⤳"
            title="No route requested yet"
            description="Choose a source and a destination, or use one of the examples above."
          />
        </Card>
      )}

      {submitted && result.loading && (
        <Card>
          <LoadingState
            message="Searching for routes…"
            detail="allShortestPaths first, then one node-avoiding search per hop to test redundancy."
          />
        </Card>
      )}

      {submitted && result.error && !result.loading && (
        <Card>
          <ErrorState error={result.error} onRetry={result.refetch} />
        </Card>
      )}

      {submitted && result.data && !result.loading && !result.error && (
        <PathResults data={result.data} />
      )}
    </div>
  );
}

const VERDICT_STYLES = {
  protected: {
    label: 'Protected',
    chip: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    tone: 'good',
  },
  partial: {
    label: 'Survives any single failure',
    chip: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
    tone: 'accent',
  },
  'at-risk': {
    label: 'At risk',
    chip: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
    tone: 'danger',
  },
  unreachable: {
    label: 'No route',
    chip: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
    tone: 'neutral',
  },
};

function PathResults({ data }) {
  const { paths, redundancy, maxHops, tookMs, from, to } = data;
  const verdict = VERDICT_STYLES[redundancy.status] ?? VERDICT_STYLES.unreachable;

  // The picture is built from the returned paths rather than fetched again:
  // every node and link the user needs to see is already in the response.
  const graph = useMemo(() => buildGraph(paths, redundancy.alternate), [paths, redundancy.alternate]);
  const criticalIds = useMemo(
    () => redundancy.criticalHops.map((hop) => hop.id),
    [redundancy.criticalHops],
  );

  if (paths.length === 0) {
    return (
      <Card title="Result">
        <EmptyState
          icon="⊘"
          title={`No route within ${maxHops} hops`}
          description={
            `Nothing connects ${from} to ${to} in ${maxHops} hops or fewer. Either they sit in ` +
            'separate parts of the network, or the route between them is longer than the ' +
            'search depth — try raising it.'
          }
        />
      </Card>
    );
  }

  return (
    <>
      <Card
        title="Verdict"
        actions={<Badge className={verdict.chip}>{verdict.label}</Badge>}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Shortest route" value={`${paths[0].hopCount} hops`} tone="accent" />
          <Stat label="Equal-shortest routes" value={formatNumber(paths.length)} />
          <Stat
            label="Unavoidable hops"
            value={formatNumber(redundancy.criticalHops.length)}
            tone={redundancy.criticalHops.length > 0 ? 'danger' : 'good'}
          />
          <Stat label="Query time" value={formatDuration(tookMs)} />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-300">{redundancy.summary}</p>

        {redundancy.criticalHops.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              {pluralise(redundancy.criticalHops.length, 'Chokepoint')}:
            </span>
            {redundancy.criticalHops.map((hop) => (
              <Badge key={hop.id} className="bg-rose-500/15 font-mono text-rose-300 ring-rose-500/30">
                {hop.name}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Routes"
        subtitle="All equal-shortest routes, plus the node-disjoint alternative when one exists."
        actions={<GraphLegend mode="role" />}
      >
        <GraphCanvas
          nodes={graph.nodes}
          links={graph.links}
          dataKey={`${from}->${to}-${maxHops}`}
          highlightedIds={criticalIds}
          height={340}
        />

        <div className="mt-5 space-y-3">
          {paths.map((path, index) => (
            <PathRow
              key={path.hops.map((hop) => hop.id).join('>')}
              path={path}
              label={index === 0 ? 'Primary' : `Alternative ${index}`}
              criticalIds={criticalIds}
            />
          ))}

          {redundancy.alternate && (
            <PathRow
              path={redundancy.alternate}
              label="Node-disjoint route"
              tone="good"
              criticalIds={criticalIds}
            />
          )}
        </div>
      </Card>
    </>
  );
}

function PathRow({ path, label, tone = 'neutral', criticalIds }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised/40 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge
          className={
            tone === 'good'
              ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
              : 'bg-slate-500/15 text-slate-400 ring-slate-500/25'
          }
        >
          {label}
        </Badge>
        <span className="text-[11px] text-slate-500">
          {path.hopCount} {pluralise(path.hopCount, 'hop')}
        </span>
      </div>

      <div className="scroll-x">
        <ol className="flex min-w-max items-center gap-1.5">
          {path.hops.map((hop, index) => (
            <li key={hop.id} className="flex items-center gap-1.5">
              {index > 0 && (
                <span className="text-slate-600" aria-hidden="true">
                  →
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11.5px]
                  ${criticalIds.includes(hop.id)
                    ? 'bg-rose-500/15 text-rose-200 ring-1 ring-inset ring-rose-500/30'
                    : 'bg-surface-panel text-slate-300'}`}
                title={roleLabel(hop.role)}
              >
                {hop.name}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Flattens the returned paths into the node and link sets the canvas needs. */
function buildGraph(paths, alternate) {
  const nodes = new Map();
  const links = new Map();

  const addPath = (path) => {
    path.hops.forEach((hop, index) => {
      if (!nodes.has(hop.id)) nodes.set(hop.id, { ...hop, customers: 0 });
      const next = path.hops[index + 1];
      if (!next) return;
      // Undirected in reality, so a canonical key stops the same physical link
      // being drawn twice when two routes traverse it in opposite directions.
      const key = [hop.id, next.id].sort().join('::');
      if (!links.has(key)) {
        links.set(key, { source: hop.id, target: next.id, kind: path.segments[index]?.kind });
      }
    });
  };

  paths.forEach(addPath);
  if (alternate) addPath(alternate);

  return { nodes: [...nodes.values()], links: [...links.values()] };
}
