import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import { useApi } from '../../hooks/useApi.js';
import { Select, TextInput, SkeletonRows, ErrorState, EmptyState } from '../../components/ui/index.jsx';
import { RoleBadge } from '../../components/DeviceChip.jsx';
import { formatNumber } from '../../lib/format.js';

const ROLE_OPTIONS = [
  { value: '', label: 'All tiers' },
  { value: 'core', label: 'Core' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'access', label: 'Access' },
];

/**
 * Device selector.
 *
 * The search box is debounced. Typing "dist-mum" unthrottled sends eight
 * requests, seven of which are thrown away, and on a free-tier instance those
 * seven queue up behind the one that matters.
 */
export function DevicePicker({ selectedId, onSelect }) {
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 220);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, loading, error, refetch } = useApi(
    ({ signal }) => api.devices({ role: role || undefined, q: debouncedSearch || undefined }, { signal }),
    [role, debouncedSearch],
  );

  const devices = data?.devices ?? [];

  // Grouped by tier so the list reads as a network rather than as 192 rows.
  const groups = useMemo(() => {
    const order = ['core', 'distribution', 'access'];
    const buckets = new Map(order.map((key) => [key, []]));
    for (const device of devices) {
      if (!buckets.has(device.role)) buckets.set(device.role, []);
      buckets.get(device.role).push(device);
    }
    return [...buckets.entries()].filter(([, items]) => items.length > 0);
  }, [devices]);

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-2 gap-2.5">
        <Select label="Tier" value={role} onChange={setRole} options={ROLE_OPTIONS} />
        <TextInput
          label="Search"
          value={search}
          placeholder="dist-mum…"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {loading && <SkeletonRows rows={6} />}

        {error && !loading && <ErrorState error={error} onRetry={refetch} />}

        {!loading && !error && devices.length === 0 && (
          <EmptyState
            icon="⌕"
            title="No devices match"
            description={
              search
                ? `Nothing is named like "${search}". Try a shorter fragment, such as a site code.`
                : 'The graph has no devices. Run the seed script to populate it.'
            }
          />
        )}

        {!loading && !error && groups.map(([groupRole, items]) => (
          <div key={groupRole} className="mb-4 last:mb-0">
            <div className="sticky top-0 z-10 bg-surface-panel/95 py-1.5 backdrop-blur">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {groupRole} · {items.length}
              </span>
            </div>

            <ul className="space-y-1">
              {items.map((device) => {
                const isSelected = device.id === selectedId;
                return (
                  <li key={device.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(device.id)}
                      aria-pressed={isSelected}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2
                        text-left transition-colors
                        ${isSelected
                          ? 'bg-sky-500/10 ring-1 ring-inset ring-sky-500/30'
                          : 'hover:bg-surface-raised'}`}
                    >
                      <span className="min-w-0">
                        <span
                          className={`block truncate font-mono text-[12.5px]
                            ${isSelected ? 'text-sky-200' : 'text-slate-200'}`}
                        >
                          {device.name}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {device.siteName}
                          {device.directCustomers > 0 && ` · ${formatNumber(device.directCustomers)} customers`}
                        </span>
                      </span>
                      <RoleBadge role={device.role} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
