import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api/client.js';
import { useApi } from './hooks/useApi.js';
import { formatNumber } from './lib/format.js';
import { BlastRadiusPage } from './features/blast-radius/BlastRadiusPage.jsx';
import { SpofPage } from './features/spof/SpofPage.jsx';
import { PathFinderPage } from './features/path-finder/PathFinderPage.jsx';
import { CypherPage } from './features/cypher/CypherPage.jsx';

/**
 * Application shell: navigation, connection status, and the active screen.
 *
 * Routing is hash-based and hand-rolled. Four screens with no nested routes and
 * no route parameters do not need a router, and the hash form survives a page
 * refresh on any static host without server rewrite rules.
 */

const SCREENS = [
  {
    id: 'blast-radius',
    label: 'Blast radius',
    blurb: 'Pick a device, see who loses service',
    icon: '◎',
    Component: BlastRadiusPage,
  },
  {
    id: 'spof',
    label: 'Single points of failure',
    blurb: 'Rank devices by how much they would strand',
    icon: '⚠',
    Component: SpofPage,
  },
  {
    id: 'paths',
    label: 'Path finder',
    blurb: 'Routes between two devices, and whether they are protected',
    icon: '⤳',
    Component: PathFinderPage,
  },
  {
    id: 'cypher',
    label: 'The queries',
    blurb: 'Every Cypher query this application runs',
    icon: '⌘',
    Component: CypherPage,
  },
];

/**
 * Hash routing with one optional parameter: `#/blast-radius/core-blr-01`.
 *
 * The parameter is what lets one screen hand a device to another — clicking a
 * finding in the SPOF audit navigates to the blast-radius screen with that
 * device already selected. Carrying it in the URL rather than in shared state
 * also makes any view in the application linkable, which matters when the
 * reviewer wants to send someone a specific result.
 */
function useHashRoute(defaultId) {
  const read = () => {
    const [id, param] = window.location.hash.replace(/^#\/?/, '').split('/');
    return {
      screenId: SCREENS.some((screen) => screen.id === id) ? id : defaultId,
      param: param ? decodeURIComponent(param) : null,
    };
  };

  const [route, setRoute] = useState(read);

  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((screenId, param) => {
    const next = param ? `#/${screenId}/${encodeURIComponent(param)}` : `#/${screenId}`;
    // Assigning the hash fires `hashchange`, which updates state. Setting state
    // here too would be a second render for the same navigation.
    if (window.location.hash === next) setRoute({ screenId, param: param ?? null });
    else window.location.hash = next;
  }, []);

  return [route, navigate];
}

export default function App() {
  const [route, navigate] = useHashRoute('blast-radius');
  const active = SCREENS.find((screen) => screen.id === route.screenId) ?? SCREENS[0];

  const health = useApi(({ signal }) => api.health({ signal }), []);
  const stats = useApi(({ signal }) => api.stats({ signal }), []);

  const databaseDown = health.data ? !health.data.database.ok : false;

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <Sidebar
        screens={SCREENS}
        activeId={active.id}
        onNavigate={navigate}
        stats={stats.data}
        statsLoading={stats.loading}
      />

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1400px] px-5 py-6 lg:px-8 lg:py-8">
          <header className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">{active.label}</h1>
            <p className="mt-1 text-sm text-slate-400">{active.blurb}</p>
          </header>

          {/* One banner at the shell level rather than an error inside every
              panel: when the database is down, every screen is down, and
              repeating that four times is noise. */}
          {databaseDown && <DatabaseBanner health={health} />}

          <div key={active.id} className="animate-fade-in">
            <active.Component routeParam={route.param} navigate={navigate} />
          </div>
        </div>
      </main>
    </div>
  );
}

function Sidebar({ screens, activeId, onNavigate, stats, statsLoading }) {
  return (
    <aside
      className="shrink-0 border-b border-surface-border bg-surface-panel/60
        lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r"
    >
      <div className="flex h-full flex-col px-5 py-5 lg:px-6 lg:py-7">
        <div>
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg
                bg-sky-500/15 text-sm text-sky-300 ring-1 ring-inset ring-sky-500/25"
              aria-hidden="true"
            >
              ◎
            </span>
            <div className="leading-tight">
              <div className="text-[13px] font-semibold text-slate-100">Blast Radius</div>
              <div className="text-[11px] text-slate-500">Network impact explorer</div>
            </div>
          </div>
        </div>

        <nav className="mt-7 flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
          {screens.map((screen) => {
            const isActive = screen.id === activeId;
            return (
              <button
                key={screen.id}
                type="button"
                onClick={() => onNavigate(screen.id, null)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left
                  text-[13px] transition-colors lg:shrink
                  ${isActive
                    ? 'bg-sky-500/10 font-medium text-sky-200 ring-1 ring-inset ring-sky-500/20'
                    : 'text-slate-400 hover:bg-surface-raised hover:text-slate-200'}`}
              >
                <span className="text-xs" aria-hidden="true">{screen.icon}</span>
                <span className="whitespace-nowrap lg:whitespace-normal">{screen.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto hidden pt-8 lg:block">
          <GraphFacts stats={stats} loading={statsLoading} />
        </div>
      </div>
    </aside>
  );
}

/** Dataset size, so the reviewer can see what is loaded without opening a shell. */
function GraphFacts({ stats, loading }) {
  if (loading) {
    return <div className="h-24 animate-pulse rounded-lg bg-surface-raised/50" />;
  }
  if (!stats) return null;

  const rows = [
    ['Devices', stats.devices],
    ['Links', stats.links],
    ['Services', stats.services],
    ['Customers', stats.customers],
  ];

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised/40 px-3.5 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        In the graph
      </div>
      <dl className="mt-2 space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] text-slate-400">{label}</dt>
            <dd className="font-mono text-[11px] tabular-nums text-slate-300">
              {formatNumber(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DatabaseBanner({ health }) {
  return (
    <div
      className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-xl border
        border-rose-500/25 bg-rose-500/10 px-4 py-3"
      role="alert"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-rose-200">CognoDB is not reachable</p>
        <p className="mt-1 break-words text-xs leading-relaxed text-rose-200/70">
          {health.data?.database?.error ?? 'The database did not respond.'}
        </p>
      </div>
      <button
        type="button"
        onClick={health.refetch}
        className="shrink-0 rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-medium
          text-rose-100 transition-colors hover:bg-rose-500/30"
      >
        Check again
      </button>
    </div>
  );
}
