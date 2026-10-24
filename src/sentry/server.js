/** The server SDK (Node), started by src/instrumentation.js when there is a DSN. */
import { httpIntegration, init } from "@sentry/nextjs";
import { serverOptions } from "./options";

export function startServerSentry() {
  init({
    ...serverOptions(),
    // Next traces incoming requests itself; and no request body is ever read into an event.
    integrations: [httpIntegration({ disableIncomingRequestSpans: true, maxIncomingRequestBodySize: "none" })],
  });
}
