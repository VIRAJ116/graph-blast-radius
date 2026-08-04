import React from 'react';
import { IMPACT_COLORS, ROLE_COLORS } from '../../lib/colors.js';

/**
 * Legend for the graph view.
 *
 * The `mode` switch matters: on the topology screen colour means device role,
 * but on the blast-radius screen colour means impact, and showing both keys at
 * once would tell the user that a red node might be either.
 */
export function GraphLegend({ mode = 'role', className = '' }) {
  const items = mode === 'impact'
    ? [
        { color: IMPACT_COLORS.failed, label: 'Failed device' },
        { color: IMPACT_COLORS.isolated, label: 'Cut off by the failure' },
        { color: IMPACT_COLORS.context, label: 'Unaffected neighbour' },
      ]
    : [
        { color: ROLE_COLORS.core, label: 'Core' },
        { color: ROLE_COLORS.distribution, label: 'Distribution' },
        { color: ROLE_COLORS.access, label: 'Access' },
      ];

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-400 ${className}`}>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          {item.label}
        </span>
      ))}
      <span className="text-slate-500">· node size = customers behind the device</span>
    </div>
  );
}
