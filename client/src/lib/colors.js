/**
 * Colour is load-bearing in this application: it is how the graph view
 * communicates device role and failure impact without a label on every node.
 *
 * These values are the literal hex the canvas renderer needs — the canvas
 * cannot read Tailwind classes — and they mirror the semantic names in
 * `tailwind.config.js`. The two are kept in step deliberately so a node and its
 * legend entry can never disagree.
 */

export const ROLE_COLORS = {
  core: '#38bdf8',
  distribution: '#a78bfa',
  access: '#34d399',
};

export const IMPACT_COLORS = {
  failed: '#f43f5e',
  isolated: '#fb923c',
  context: '#475569',
};

/** Tailwind classes for role chips, matching ROLE_COLORS. */
export const ROLE_CHIP_CLASSES = {
  core: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  distribution: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  access: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
};

export const IMPACT_CHIP_CLASSES = {
  failed: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  isolated: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  context: 'bg-slate-500/15 text-slate-400 ring-slate-500/30',
};

/**
 * Impact wins over role when a node is affected.
 *
 * A failed core router must read as *failed* first: its role is secondary
 * information once it is the thing that broke.
 */
export function nodeColor(node) {
  if (node.impact && node.impact !== 'context') return IMPACT_COLORS[node.impact];
  if (node.impact === 'context') return IMPACT_COLORS.context;
  return ROLE_COLORS[node.role] ?? '#64748b';
}

/**
 * Node radius encodes how many customers sit behind a device, compressed with
 * a square root so a router with 60 customers does not render forty times the
 * area of one with 4 and swamp the picture.
 */
export function nodeRadius(node) {
  const base = node.role === 'core' ? 7 : node.role === 'distribution' ? 5.5 : 4;
  const customers = node.customers ?? 0;
  return base + Math.sqrt(customers) * 0.75;
}

export const LINK_COLORS = {
  'core-core': 'rgba(56, 189, 248, 0.45)',
  'dist-core': 'rgba(167, 139, 250, 0.40)',
  'access-dist': 'rgba(52, 211, 153, 0.30)',
  default: 'rgba(148, 163, 184, 0.30)',
  highlighted: 'rgba(244, 63, 94, 0.85)',
};
