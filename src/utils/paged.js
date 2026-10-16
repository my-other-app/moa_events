import { useCallback, useEffect, useRef, useState } from "react";

const keyOf = (item) => item?.id ?? item?.slug;

/**
 * A list that loads its first page whenever `key` changes and grows with
 * "Load more". `load(offset)` resolves a page: {items, total, ...}. A late
 * answer to an older key is ignored, so fast filter changes never mix.
 */
export function usePagedList(load, key) {
  const [state, setState] = useState({ status: "loading", items: [], total: 0, page: null });
  const [more, setMore] = useState({ busy: false, error: false });
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);
  const loader = useRef(load);
  const count = useRef(0);

  useEffect(() => {
    loader.current = load;
  });

  useEffect(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, status: "loading" }));
    setMore({ busy: false, error: false });
    loader.current(0).then(
      (page) => {
        if (id !== seq.current) return;
        count.current = page.items.length;
        setState({ status: "ready", items: page.items, total: page.total, page });
      },
      () => {
        if (id === seq.current) setState((s) => ({ ...s, status: "error" }));
      }
    );
  }, [key, attempt]);

  const loadMore = useCallback(() => {
    const id = seq.current;
    setMore({ busy: true, error: false });
    loader.current(count.current).then(
      (page) => {
        if (id !== seq.current) return;
        // The next page starts after everything the server has sent, duplicates included.
        count.current += page.items.length;
        setState((s) => {
          const seen = new Set(s.items.map(keyOf));
          const items = [...s.items, ...page.items.filter((i) => !seen.has(keyOf(i)))];
          // An empty page means the end, whatever the total said.
          return { ...s, items, total: page.items.length ? Math.max(page.total, items.length) : items.length };
        });
        setMore({ busy: false, error: false });
      },
      () => {
        if (id === seq.current) setMore({ busy: false, error: true });
      }
    );
  }, []);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { ...state, more, loadMore, retry };
}
