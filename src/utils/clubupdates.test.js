import { describe, expect, it } from "vitest";
import { clubUpdatesText, offersClubUpdates } from "./clubupdates";

describe("the club's updates on WhatsApp", () => {
  it("names the club in the box's words, exactly as the server keeps them", () => {
    expect(clubUpdatesText("Circuit Society")).toBe("Get updates from Circuit Society on WhatsApp");
    expect(clubUpdatesText("  Yasya ")).toBe("Get updates from Yasya on WhatsApp");
    expect(clubUpdatesText("")).toBe("Get updates from this club on WhatsApp");
  });

  it("is offered only when the API says true", () => {
    expect(offersClubUpdates({ whatsapp_updates: true })).toBe(true);
    for (const club of [{ whatsapp_updates: false }, { whatsapp_updates: "true" }, {}, null, undefined]) {
      expect(offersClubUpdates(club)).toBe(false);
    }
  });
});
