/**
 * Shared UI primitives.
 *
 * Collected in one file because each is a handful of lines and they are always
 * imported together; splitting them across nine files would add navigation cost
 * without adding clarity.
 *
 * The three state components — Spinner, EmptyState, ErrorState — exist so that
 * every screen handles loading, nothing-to-show and something-broke the same
 * way. A screen that invents its own is a screen that will forget one of them.
 */
import React from 'react';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Card({ title, subtitle, actions, children, className = '', bodyClassName = '' }) {
  return (
    <section
      className={`rounded-xl border border-surface-border bg-surface-panel shadow-lg shadow-black/20 ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-1 text-xs leading-relaxed text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`px-5 py-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/**
 * A single headline number.
 *
 * `tone` carries meaning: an impact figure of zero is good news and should not
 * be painted red just because the tile is on the impact panel.
 */
export function Stat({ label, value, hint, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-slate-100',
    danger: 'text-rose-400',
    warning: 'text-orange-300',
    good: 'text-emerald-400',
    accent: 'text-sky-300',
  };
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised/60 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function Button({ children, variant = 'secondary', size = 'md', className = '', ...props }) {
  const variants = {
    primary: 'bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:bg-sky-500/40',
    secondary:
      'bg-surface-raised text-slate-200 ring-1 ring-inset ring-surface-border hover:bg-slate-700/60',
    ghost: 'text-slate-300 hover:bg-surface-raised hover:text-slate-100',
    danger: 'bg-rose-500/90 text-white hover:bg-rose-500',
  };
  const sizes = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3.5 py-2 text-sm',
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors
        disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Select({ label, value, onChange, options, placeholder, className = '', ...props }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          {label}
        </span>
      )}
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border-0 bg-surface-raised px-3 py-2 text-sm text-slate-100
          ring-1 ring-inset ring-surface-border transition-shadow hover:ring-slate-600
          focus:ring-2 focus:ring-sky-400"
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextInput({ label, className = '', ...props }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          {label}
        </span>
      )}
      <input
        type="text"
        className="w-full rounded-lg border-0 bg-surface-raised px-3 py-2 text-sm text-slate-100
          placeholder:text-slate-500 ring-1 ring-inset ring-surface-border transition-shadow
          hover:ring-slate-600 focus:ring-2 focus:ring-sky-400"
        {...props}
      />
    </label>
  );
}

export function Badge({ children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium
        ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2Z"
      />
    </svg>
  );
}

/**
 * Skeleton rows.
 *
 * Preferred over a centred spinner for tables: it holds the layout still, so
 * the page does not jump when results arrive.
 */
export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="relative h-10 overflow-hidden rounded-lg bg-surface-raised/60"
          style={{ opacity: 1 - index * 0.12 }}
        >
          <div
            className="absolute inset-0 -translate-x-full animate-shimmer
              bg-gradient-to-r from-transparent via-white/5 to-transparent"
          />
        </div>
      ))}
    </div>
  );
}

export function LoadingState({ message = 'Running query…', detail }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <Spinner className="h-6 w-6 text-sky-400" />
      <div>
        <p className="text-sm font-medium text-slate-200">{message}</p>
        {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, icon = '◇', action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full
          bg-surface-raised text-lg text-slate-500"
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="max-w-md">
        <p className="text-sm font-medium text-slate-200">{title}</p>
        {description && <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Error state.
 *
 * Reads the ApiError code rather than showing a raw message, because the three
 * cases need different words and different offers: a database that is down
 * (retry), a database that was never configured (fix .env — retrying is
 * pointless), and everything else.
 */
export function ErrorState({ error, onRetry, className = '' }) {
  const isConfiguration = error?.isConfiguration;
  const isUnavailable = error?.code === 'database_unavailable' || error?.code === 'network_error';

  const title = isConfiguration
    ? 'The database connection is not configured'
    : isUnavailable
      ? 'Cannot reach the database'
      : 'Something went wrong';

  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 px-6 py-12 text-center ${className}`}
      role="alert"
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full
          bg-rose-500/10 text-lg text-rose-400 ring-1 ring-inset ring-rose-500/20"
        aria-hidden="true"
      >
        !
      </div>

      <div className="max-w-lg">
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
          {error?.message ?? 'An unexpected error occurred.'}
        </p>
        {error?.hint && (
          <p className="mt-2 rounded-lg bg-surface-raised px-3 py-2 text-xs leading-relaxed text-slate-400">
            {error.hint}
          </p>
        )}
      </div>

      {/* Retrying a misconfiguration cannot succeed, so the button is not offered. */}
      {onRetry && !isConfiguration && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function Table({ columns, rows, keyField = 'id', onRowClick, emptyMessage = 'No rows.' }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-xs text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="scroll-x -mx-5">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-surface-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase
                  tracking-wider text-slate-400 ${column.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row[keyField]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-surface-border/50 transition-colors last:border-0
                ${onRowClick ? 'cursor-pointer hover:bg-surface-raised/60' : ''}`}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-5 py-2.5 align-middle ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}
                >
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
