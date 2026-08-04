/**
 * Display formatting.
 *
 * Kept in one place so the same number never appears two ways on two screens.
 */

const numberFormatter = new Intl.NumberFormat('en-US');

export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return numberFormatter.format(value);
}

/**
 * Monthly recurring revenue, abbreviated.
 *
 * Impact figures reach six digits and appear inside tables and stat tiles where
 * exact rupees are noise; the ranking is what the user is reading.
 */
export function formatMrr(value) {
  if (!value) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${numberFormatter.format(Math.round(value))}`;
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const ROLE_LABELS = {
  core: 'Core',
  distribution: 'Distribution',
  access: 'Access',
};

export const SEGMENT_LABELS = {
  enterprise: 'Enterprise',
  smb: 'SMB',
  residential: 'Residential',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role;
}

/** Sentence-cased service type: "mpls-vpn" reads badly in a table header. */
export function serviceTypeLabel(type) {
  const labels = {
    internet: 'Internet',
    'mpls-vpn': 'MPLS VPN',
    voice: 'Voice',
    video: 'Video',
  };
  return labels[type] ?? type;
}

export function pluralise(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}
