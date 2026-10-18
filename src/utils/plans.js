import { useCallback, useEffect, useState } from "react";
import { plansApi } from "@/api/plans";

/**
 * The plans for a page: {status: "loading" | "ready" | "error", data, retry}.
 * A late answer after the page has gone is dropped. With `initial` (the
 * plans the server read), they are ready at once and nothing is asked
 * unless retry() is.
 */
export function usePlans(initial = null) {
  const [state, setState] = useState(initial ? { status: "ready", data: initial } : { status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const given = Boolean(initial);

  useEffect(() => {
    if (given && attempt === 0) return undefined;
    let alive = true;
    plansApi.list().then(
      (data) => alive && setState({ status: "ready", data }),
      () => alive && setState({ status: "error", data: null })
    );
    return () => {
      alive = false;
    };
  }, [attempt, given]);

  const retry = useCallback(() => {
    setState({ status: "loading", data: null });
    setAttempt((a) => a + 1);
  }, []);

  return { ...state, retry };
}
