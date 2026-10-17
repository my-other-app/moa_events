import { useCallback, useEffect, useState } from "react";
import { plansApi } from "@/api/plans";

/**
 * The plans for a page: {status: "loading" | "ready" | "error", data, retry}.
 * A late answer after the page has gone is dropped.
 */
export function usePlans() {
  const [state, setState] = useState({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    plansApi.list().then(
      (data) => alive && setState({ status: "ready", data }),
      () => alive && setState({ status: "error", data: null })
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading", data: null });
    setAttempt((a) => a + 1);
  }, []);

  return { ...state, retry };
}
