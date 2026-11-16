import { takeReport } from "@/server/cspreport";

/*
 * POST /api/csp-report: where browsers send what the site's script policy
 * (next.config.mjs, `report-uri`) blocked, or would have blocked while it
 * is only reported. Logged as one short line per kind (src/server/cspreport.js);
 * always a 204.
 */
export const dynamic = "force-dynamic";

export const POST = (request) => takeReport(request);
