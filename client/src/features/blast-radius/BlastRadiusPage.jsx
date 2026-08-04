import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import { useApi } from '../../hooks/useApi.js';
import {
  Card, Stat, Table, Badge, ErrorState, EmptyState, LoadingState,
} from '../../components/ui/index.jsx';
import { GraphCanvas } from '../../components/graph/GraphCanvas.jsx';
import { GraphLegend } from '../../components/graph/GraphLegend.jsx';
import { RoleBadge, DeviceName } from '../../components/DeviceChip.jsx';
import { DevicePicker } from './DevicePicker.jsx';
import {
  formatMrr, formatNumber, formatDuration, pluralise, serviceTypeLabel, SEGMENT_LABELS,
} from '../../lib/format.js';

/**
 * Blast radius explorer — the screen the application exists for.
 *
 * Reads as one sentence: pick a device, mark it failed, see who loses service.
 * The answer is split into the two things that are genuinely different — the
 * customers attached to the device, and the customers stranded elsewhere
 * because the device was their only route to the backbone.
 */
export function BlastRadiusPage({ routeParam, navigate }) {
  const [selectedId, setSelectedId] = useState(routeParam ?? null);

  // A device arriving in the URL — from a SPOF finding, or a shared link —
  // takes over the selection.
  useEffect(() => {
    if (routeParam && routeParam !== selectedId) setSelectedId(routeParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParam]);

  const selectDevice = (deviceId) => {
    setSelectedId(deviceId);
    // Keep the URL in step so the current view stays linkable and the back
    // button walks through the devices the user looked at.
    navigate?.('blast-radius', deviceId);
  };

  const { data, loading, error, refetch } = useApi(
    ({ signal }) => api.blastRadius(selectedId, { signal }),
    [selectedId],
    { enabled: Boolean(selectedId) },
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <Card
        title="1 · Choose a device"
        subtitle="Then imagine it has just failed."
        className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]"
        bodyClassName="flex flex-col xl:h-[calc(100vh-11rem)]"
      >
        <DevicePicker selectedId={selectedId} onSelect={selectDevice} />
      </Card>

      <div className="min-w-0 space-y-5">
        {!selectedId && <IntroPanel />}

        {selectedId && loading && (
          <Card>
            <LoadingState
              message="Working out the blast radius…"
              detail="Running a fixed 4-hop traversal for attached services, and a bounded variable-depth reachability search for everything else."
            />
          </Card>
        )}

        {selectedId && error && !loading && (
          <Card>
            <ErrorState error={error} onRetry={refetch} />
          </Card>
        )}

        {selectedId && data && !loading && !error && <Results data={data} />}
      </div>
    </div>
  );
}

function IntroPanel() {
  return (
    <Card>
      <EmptyState
        icon="◎"
        title="Select a device to begin"
        description={
          'Every device in the list can be treated as failed. Core routers usually have no customers ' +
          'of their own — their damage is entirely in what they cut off. Try core-blr-01 or ' +
          'core-mum-01 to see that, or any access router to see the other half.'
        }
      />
    </Card>
  );
}

function Results({ data }) {
  const { device, direct, isolation, totals, graph, reachabilityDepth, tookMs } = data;
  const nothingHappens = totals.impactedCustomers === 0;

  return (
    <>
      <Card
        title={`2 · If ${device.name} fails`}
        subtitle={`${device.vendor} ${device.model} · ${device.siteName}`}
        actions={<RoleBadge role={device.role} />}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Customers affected"
            value={formatNumber(totals.impactedCustomers)}
            tone={totals.impactedCustomers > 0 ? 'danger' : 'good'}
            hint={nothingHappens ? 'Fully redundant' : 'Direct plus stranded'}
          />
          <Stat
            label="Revenue at risk"
            value={formatMrr(totals.mrrAtRisk)}
            tone={totals.mrrAtRisk > 0 ? 'warning' : 'good'}
            hint="Monthly recurring"
          />
          <Stat
            label="Devices cut off"
            value={formatNumber(isolation.devices.length)}
            tone={isolation.devices.length > 0 ? 'warning' : 'good'}
            hint="Lose all routes to core"
          />
          <Stat
            label="Query time"
            value={formatDuration(tookMs)}
            tone="accent"
            hint={`Search depth ${reachabilityDepth}`}
          />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-300">
          {nothingHappens ? (
            <>
              <span className="font-medium text-emerald-400">No customer impact.</span>{' '}
              Every device that routes through <Mono>{device.name}</Mono> has another way to
              reach the backbone, and nothing is attached to it directly. This is what a properly
              redundant device looks like.
            </>
          ) : (
            <>
              <span className="font-medium text-rose-400">
                {formatNumber(totals.impactedCustomers)}{' '}
                {pluralise(totals.impactedCustomers, 'customer')} lose service.
              </span>{' '}
              {direct.customerCount > 0 && (
                <>
                  {formatNumber(direct.customerCount)} {pluralise(direct.customerCount, 'is', 'are')}{' '}
                  connected directly to <Mono>{device.name}</Mono>
                  {isolation.customerCount > 0 ? '; ' : '. '}
                </>
              )}
              {isolation.customerCount > 0 && (
                <>
                  {formatNumber(isolation.customerCount)} sit behind{' '}
                  {formatNumber(isolation.devices.length)}{' '}
                  {pluralise(isolation.devices.length, 'device')} that would have no remaining route
                  to any core router.
                </>
              )}
            </>
          )}
        </p>
      </Card>

      <Card
        title="3 · The neighbourhood"
        subtitle="The failed device, everything it cuts off, and one hop of surrounding context."
        actions={<GraphLegend mode="impact" />}
      >
        <GraphCanvas
          nodes={graph.nodes}
          links={graph.links}
          dataKey={device.id}
          highlightedIds={highlightedIdsFor(graph)}
          height={440}
          emptyMessage="No neighbourhood to draw."
        />
      </Card>

      {isolation.devices.length > 0 && (
        <Card
          title="Devices cut off from the backbone"
          subtitle={
            `Each of these can reach a core router today, but every route within ${reachabilityDepth} ` +
            `hops passes through ${device.name}.`
          }
        >
          <Table
            columns={[
              {
                key: 'name',
                header: 'Device',
                render: (row) => <DeviceName device={row} secondary={row.siteName} />,
              },
              { key: 'role', header: 'Tier', render: (row) => <RoleBadge role={row.role} /> },
              {
                key: 'services',
                header: 'Services',
                align: 'right',
                render: (row) => formatNumber(row.services),
              },
              {
                key: 'customers',
                header: 'Customers',
                align: 'right',
                render: (row) => (
                  <span className={row.customers > 0 ? 'text-orange-300' : 'text-slate-500'}>
                    {formatNumber(row.customers)}
                  </span>
                ),
              },
              {
                key: 'mrrAtRisk',
                header: 'MRR',
                align: 'right',
                render: (row) => formatMrr(row.mrrAtRisk),
              },
            ]}
            rows={isolation.devices}
          />
        </Card>
      )}

      {direct.services.length > 0 && (
        <Card
          title="Services attached to this device"
          subtitle="Circuits terminating on its interfaces — these drop the moment it goes down."
        >
          <Table
            columns={[
              {
                key: 'name',
                header: 'Service',
                render: (row) => (
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-slate-100">{row.name}</div>
                    <div className="truncate font-mono text-[11px] text-slate-500">
                      {row.interfaceName} · {row.circuitId}
                    </div>
                  </div>
                ),
              },
              {
                key: 'type',
                header: 'Type',
                render: (row) => (
                  <Badge className="bg-slate-500/15 text-slate-300 ring-slate-500/25">
                    {serviceTypeLabel(row.type)}
                  </Badge>
                ),
              },
              {
                key: 'slaTier',
                header: 'SLA',
                render: (row) => <span className="capitalize text-slate-300">{row.slaTier}</span>,
              },
              {
                key: 'customerCount',
                header: 'Customers',
                align: 'right',
                render: (row) => formatNumber(row.customerCount),
              },
            ]}
            rows={direct.services}
          />
        </Card>
      )}

      <AffectedCustomers direct={direct} isolation={isolation} />
    </>
  );
}

/**
 * Named customers from both halves in one table.
 *
 * The `reason` column is the point: it tells the user *why* each customer is on
 * the list, which is the difference between a number and an explanation.
 */
function AffectedCustomers({ direct, isolation }) {
  const rows = useMemo(
    () =>
      [...direct.customers, ...isolation.customers]
        .sort((a, b) => b.mrr - a.mrr)
        .slice(0, 100),
    [direct.customers, isolation.customers],
  );

  if (rows.length === 0) return null;

  return (
    <Card
      title="Affected customers"
      subtitle={
        isolation.customersTruncated
          ? 'Highest-revenue first. The named list is capped; the counts above are exact.'
          : 'Highest-revenue first.'
      }
    >
      <Table
        keyField="id"
        columns={[
          {
            key: 'name',
            header: 'Customer',
            render: (row) => (
              <div className="min-w-0">
                <div className="truncate text-[13px] text-slate-100">{row.name}</div>
                <div className="truncate text-[11px] text-slate-500">
                  {SEGMENT_LABELS[row.segment] ?? row.segment}
                </div>
              </div>
            ),
          },
          {
            key: 'serviceName',
            header: 'Service',
            render: (row) => (
              <span className="text-[12.5px] text-slate-300">{row.serviceName}</span>
            ),
          },
          {
            key: 'reason',
            header: 'Why',
            render: (row) =>
              row.reason === 'direct' ? (
                <Badge className="bg-rose-500/15 text-rose-300 ring-rose-500/25">
                  Attached to failed device
                </Badge>
              ) : (
                <Badge className="bg-orange-500/15 text-orange-300 ring-orange-500/25">
                  Behind {row.deviceName}
                </Badge>
              ),
          },
          { key: 'mrr', header: 'MRR', align: 'right', render: (row) => formatMrr(row.mrr) },
        ]}
        rows={rows}
      />
    </Card>
  );
}

function highlightedIdsFor(graph) {
  return graph.nodes.filter((node) => node.impact !== 'context').map((node) => node.id);
}

function Mono({ children }) {
  return <span className="font-mono text-[0.92em] text-slate-100">{children}</span>;
}
