import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Wrap an async action with busy/error state for a button. Errors are kept
 * for display instead of thrown, so a failed BLE operation is visible.
 */
export function useAsyncAction<A extends unknown[]>(action: (...args: A) => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: A) => {
      setBusy(true);
      setError(null);
      try {
        await action(...args);
      } catch (err) {
        if (mounted.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [action],
  );

  return { run, busy, error };
}
