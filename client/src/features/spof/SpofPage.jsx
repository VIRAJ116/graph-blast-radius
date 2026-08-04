import React, { useState } from 'react';
import { api } from '../../api/client.js';
import { useApi } from '../../hooks/useApi.js';
import {
  Card, Stat, Table, Button, Badge, ErrorState, EmptyState, LoadingState,
} from '../../components/ui/index.jsx';
import { RoleBadge, DeviceName } from '../../components/DeviceChip.jsx';
import { formatMrr, formatNumber, formatDuration, pluralise } from '../../lib/format.js';

/**
 * Single point of failure audit.
 *
 * The screen that answers "where should we spend the redundancy budget?".
 * Every row is the isolation query run against one candidate device, ranked by
 * how many customers that failure would strand.
 */
export function SpofPage({ navigate }) {
  const [refreshToken, setRefreshToken] = useState(0);

  const { data, loading, error, refetch } = useApi(
    ({ signal }) => api.spof({ limit: 40, refresh: refreshToken > 0 ? 'true' : undefined }, { signal }),
    [refreshToken],
  );

  return (
    <div className="space-y-5">
      <Card
        title="How this is computed"
        subtitle="Every core and distribution router is tested by asking the database to prove a negative."
      >
        <p className="text-sm leading-relaxed text-slate-300">
          For each candidate, the audit runs the same reachability query the blast-radius screen
          uses: find every device that can reach a core router today, but has{' '}
          <span className="font-medium text-slate-100">no route that avoids the candidate</span>.
          A candidate that strands nothing is correctly redundant and is left out of the table
          entirely — only findings are listed.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Access routers are not audited by default. An access router failing takes out the
          customers hanging off it, which is the definition of an access router rather than a
          design flaw. The result is cached, because roughly forty variable-depth traversals is
          seconds of work on a free-tier instance rather than milliseconds.
        </p>
      </Card>

      {loading && (
        <Card>
          <LoadingState
            message="Auditing every core and distribution router…"
            detail="One bounded reachability search per candidate, four at a time."
          />
        </Card>
      )}

      {error && !loading && (
        <Card>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      )}

      {data && !loading && !error && (
        <Findings
          data={data}
          onRefresh={() => setRefreshToken((n) => n + 1)}
          navigate={navigate}
        />
      )}
    </div>
  );
}

function Findings({ data, onRefresh, navigate }) {
  const { findings, candidatesAudited, totalFindings, tookMs, cached, cacheTtlSeconds } = data;

  const worst = findings[0];
  const totalStranded = findings.reduce((sum, finding) => sum + finding.isolatedCustomers, 0);

  return (
    <>
      <Card
        title="Audit summary"
        actions={
          <Button size="sm" variant="secondary" onClick={onRefresh}>
            Recompute
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Devices audited" value={formatNumber(candidatesAudited)} tone="accent" />
          <Stat
            label="Single points of failure"
            value={formatNumber(totalFindings)}
            tone={totalFindings > 0 ? 'danger' : 'good'}
            hint={`${((totalFindings / Math.max(candidatesAudited, 1)) * 100).toFixed(0)}% of candidates`}
          />
          <Stat
            label="Worst case"
            value={worst ? formatNumber(worst.isolatedCustomers) : '0'}
            tone="warning"
            hint={worst ? worst.name : 'None'}
          />
          <Stat
            label="Audit time"
            value={formatDuration(tookMs)}
            hint={cached ? `cached, ${cacheTtlSeconds}s TTL` : 'freshly computed'}
          />
        </div>

        {worst && (
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            <span className="font-medium text-rose-400">{worst.name}</span> is the most valuable
            thing to make redundant: losing it strands{' '}
            {formatNumber(worst.isolatedDevices)} {pluralise(worst.isolatedDevices, 'device')} and{' '}
            {formatNumber(worst.isolatedCustomers)} {pluralise(worst.isolatedCustomers, 'customer')},
            worth {formatMrr(worst.mrrAtRisk)} of monthly recurring revenue. Across all findings,{' '}
            {formatNumber(totalStranded)} customer relationships depend on a device with no
            redundant path.
          </p>
        )}
      </Card>

      <Card
        title="Findings"
        subtitle="Ranked by customers stranded. Follow a row into the blast-radius screen to see exactly who."
      >
        {findings.length === 0 ? (
          <EmptyState
            icon="✓"
            title="No single points of failure"
            description="Every audited device has an alternative path around it. That is the result you want."
          />
        ) : (
          <Table
            columns={[
              {
                key: 'rank',
                header: '#',
                render: (row) => (
                  <span className="font-mono text-xs text-slate-500">
                    {findings.indexOf(row) + 1}
                  </span>
                ),
              },
              {
                key: 'name',
                header: 'Device',
                render: (row) => <DeviceName device={row} secondary={row.siteName} />,
              },
              { key: 'role', header: 'Tier', render: (row) => <RoleBadge role={row.role} /> },
              {
                key: 'isolatedDevices',
                header: 'Devices stranded',
                align: 'right',
                render: (row) => formatNumber(row.isolatedDevices),
              },
              {
                key: 'isolatedCustomers',
                header: 'Customers',
                align: 'right',
                render: (row) => (
                  <span className="font-medium text-orange-300">
                    {formatNumber(row.isolatedCustomers)}
                  </span>
                ),
              },
              {
                key: 'mrrAtRisk',
                header: 'MRR at risk',
                align: 'right',
                render: (row) => formatMrr(row.mrrAtRisk),
              },
              {
                key: 'sample',
                header: 'Examples',
                render: (row) => (
                  <div className="flex flex-wrap gap-1">
                    {row.sample.slice(0, 3).map((item) => (
                      <Badge
                        key={item.id}
                        className="bg-slate-500/10 font-mono text-slate-400 ring-slate-600/30"
                      >
                        {item.name}
                      </Badge>
                    ))}
                    {row.isolatedDevices > 3 && (
                      <span className="text-[11px] text-slate-500">
                        +{row.isolatedDevices - 3} more
                      </span>
                    )}
                  </div>
                ),
              },
            ]}
            rows={findings}
            // Hands the device to the blast-radius screen through the URL, so
            // the user lands on the full breakdown for the row they clicked.
            onRowClick={(row) => navigate('blast-radius', row.id)}
          />
        )}
      </Card>
    </>
  );
}
