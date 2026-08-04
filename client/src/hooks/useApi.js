import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async fetcher and exposes { data, error, loading, refetch }.
 *
 * Two details that matter more than they look:
 *
 *   - Each run gets an AbortController, and the previous run is aborted when a
 *     new one starts. Without that, a user clicking through devices quickly can
 *     have an early slow response land after a later fast one and overwrite it.
 *
 *   - `enabled: false` keeps a hook mounted but idle, which is how the screens
 *     avoid firing a request before the user has chosen the thing to fetch.
 */
export function useApi(fetcher, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const controllerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState((previous) => ({ ...previous, loading: true, error: null }));

    try {
      const data = await fetcher({ signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted) return;
      setState({ data, error: null, loading: false });
    } catch (error) {
      if (error.name === 'AbortError' || !mountedRef.current) return;
      setState({ data: null, error, loading: false });
    }
    // fetcher is intentionally excluded: callers pass an inline arrow, so
    // including it would re-run on every render. `deps` is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    void run();
  }, [run, enabled]);

  return { ...state, refetch: run };
}
