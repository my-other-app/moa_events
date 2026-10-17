import apiClient from "./client";
import { parsePlans } from "@/utils/pricing";

/**
 * The clubs' plans (GET /api/v1/plans), public and the same for everyone, so
 * no token goes with the request. An answer with no plan in it is an error
 * to the pages, which then show their calm "see the plans in the dashboard"
 * instead of an empty grid.
 */
export const plansApi = {
  list: () =>
    apiClient.get("/api/v1/plans", { skipAuth: true }).then((r) => {
      const data = parsePlans(r.data);
      if (!data) throw new Error("No plans came back");
      return data;
    }),
};
