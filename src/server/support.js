import "server-only";
import { cache } from "react";
import { parseHelpAnswers, parseTopics } from "@/utils/help";
import { apiGet } from "./api";

/**
 * What /help shows before anyone types: the desk's published answers and
 * its topics (GET /api/v1/support/help and /topics), read on the server and
 * kept five minutes (tag "help"; /api/revalidate takes `"help": true`).
 *
 *   {desk: "on", answers, topics}   the desk is there (answers may be empty)
 *   {desk: "off"}                   the API has no desk yet (404): the page
 *                                   shows its own answers (@/content/support)
 *                                   and says "email us"
 *   {desk: "unknown"}               the API didn't answer: the same answers,
 *                                   and the form asks for the topics itself
 *                                   in the browser
 *
 * Never throws: people come to the help page when something is broken, so
 * it renders whatever the API says, or doesn't.
 */
export const HELP_TAG = "help";

export const getHelpDesk = cache(async () => {
  try {
    const [help, topics] = await Promise.all([
      apiGet("/api/v1/support/help", { revalidate: 300, tags: [HELP_TAG] }),
      apiGet("/api/v1/support/topics", { revalidate: 300, tags: [HELP_TAG] }),
    ]);
    if (help.status === 404 || topics.status === 404) return { desk: "off" };
    const answers = parseHelpAnswers(help.data);
    const list = parseTopics(topics.data);
    if (!answers || !list) return { desk: "unknown" };
    return { desk: "on", answers, topics: list };
  } catch {
    return { desk: "unknown" };
  }
});
