import React from 'react';
import { Badge } from './ui/index.jsx';
import { ROLE_CHIP_CLASSES } from '../lib/colors.js';
import { roleLabel } from '../lib/format.js';

/** Role badge, coloured to match the node colour used in the graph view. */
export function RoleBadge({ role }) {
  return (
    <Badge className={ROLE_CHIP_CLASSES[role] ?? 'bg-slate-500/15 text-slate-300 ring-slate-500/30'}>
      {roleLabel(role)}
    </Badge>
  );
}

/**
 * Device identifier rendered as monospace.
 *
 * Device names are structured (`dist-cok-03` = tier, site, number). A
 * monospace face makes that structure scannable down a column, which a
 * proportional face does not.
 */
export function DeviceName({ device, secondary }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-mono text-[13px] text-slate-100">{device.name ?? device.id}</div>
      {secondary && <div className="truncate text-[11px] text-slate-500">{secondary}</div>}
    </div>
  );
}
