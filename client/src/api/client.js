/**
 * API client.
 *
 * One job beyond fetching: turn every failure into the same shape, so that
 * components never branch on whether something was a network error, a 503 from
 * the server, or a malformed body. `ApiError` carries the code the server sent,
 * which is what lets the UI distinguish "the database is unreachable" from
 * "that device does not exist" and say something useful about each.
 */

export class ApiError extends Error {
  constructor({ message, code, status, hint }) {
    super(message);
    this.name = 'ApiError';
    this.code = code ?? 'unknown';
    this.status = status ?? 0;
    this.hint = hint ?? null;
  }

  /** True when retrying might plausibly work: the database, not the request. */
  get isRetryable() {
    return ['database_unavailable', 'network_error', 'internal_error'].includes(this.code);
  }

  /** True when the operator has to change configuration before anything works. */
  get isConfiguration() {
    return ['configuration_error', 'database_unauthorized'].includes(this.code);
  }
}

function buildUrl(path, params) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, value);
  }
  return url.pathname + url.search;
}

async function request(path, { params, signal } = {}) {
  let response;

  try {
    response = await fetch(buildUrl(path, params), {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    // AbortError is a cancelled request, not a failure — let callers ignore it.
    if (error.name === 'AbortError') throw error;
    throw new ApiError({
      code: 'network_error',
      message: 'Could not reach the application server.',
      hint: 'Check that the API process is running.',
    });
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON body on an error response is still an error; on a success
    // response it means the server sent something unexpected.
    if (response.ok) {
      throw new ApiError({
        code: 'invalid_response',
        status: response.status,
        message: 'The server returned a response that could not be read.',
      });
    }
  }

  if (!response.ok) {
    throw new ApiError({
      code: body?.error,
      status: response.status,
      message: body?.message ?? `Request failed with status ${response.status}.`,
      hint: body?.hint,
    });
  }

  return body;
}

export const api = {
  health: (options) => request('/api/health', options),
  stats: (options) => request('/api/catalog/stats', options),
  sites: (options) => request('/api/catalog/sites', options),
  devices: (params, options) => request('/api/catalog/devices', { ...options, params }),
  device: (id, options) => request(`/api/devices/${encodeURIComponent(id)}`, options),
  topology: (params, options) => request('/api/topology', { ...options, params }),
  blastRadius: (id, options) => request(`/api/blast-radius/${encodeURIComponent(id)}`, options),
  spof: (params, options) => request('/api/spof', { ...options, params }),
  paths: (params, options) => request('/api/paths', { ...options, params }),
  queries: (options) => request('/api/queries', options),
};
