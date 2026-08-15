import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '../../shared/domain/errors';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads async data with the three states every surface is required to render.
 *
 * Results from a superseded request are discarded, which matters on the search
 * page: typing quickly fires several overlapping loads and the last one to *start*
 * must win, not the last one to finish.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[],
): AsyncState<T> & { reload: () => void; setData: (value: T) => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const requestId = useRef(0);
  // Kept in a ref so a new inline loader on every render does not re-trigger.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    const id = ++requestId.current;
    setState((current) => ({ ...current, loading: true, error: null }));

    loaderRef.current()
      .then((data) => {
        if (id !== requestId.current) return;
        setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (id !== requestId.current) return;
        setState({ data: null, loading: false, error: toUserMessage(error) });
      });
  }, []);

  useEffect(() => {
    run();
    return () => {
      // Invalidate in-flight work on unmount so no state update lands after it.
      requestId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback((value: T) => {
    setState({ data: value, loading: false, error: null });
  }, []);

  return { ...state, reload: run, setData };
}
