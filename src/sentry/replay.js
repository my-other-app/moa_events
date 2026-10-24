import { addIntegration, replayIntegration } from "@sentry/nextjs";

/** Session replay for sessions that hit an error, with every word, input and picture masked. */
export function addReplay() {
  addIntegration(replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }));
}
