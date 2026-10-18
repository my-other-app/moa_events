"use client";

import { createContext, useContext } from "react";

/*
 * Whether the site has topics to link to (the footer's "Topics"). Decided
 * on the server once per render of the root layout (src/server/topics.js's
 * hasTopics: false while the API has none, or doesn't answer in time) and
 * handed down, so the footer's first paint has the link or doesn't, the
 * same on the server and in the browser.
 */
const TopicsNav = createContext(false);

export function TopicsNavProvider({ on = false, children }) {
  return <TopicsNav.Provider value={Boolean(on)}>{children}</TopicsNav.Provider>;
}

export const useTopicsNav = () => useContext(TopicsNav);
