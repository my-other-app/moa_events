/**
 * "Get updates from <club> on WhatsApp": a yes to the club's own broadcasts,
 * from the club's own WhatsApp number. Meta's opt-in rule is that the box
 * names the business, so these are exactly the words the server keeps with
 * the yes (app/api/club_whatsapp/consent.py `text_for`).
 *
 * The box is unticked until the person ticks it, and shown only where the API
 * says the club can use it (`whatsapp_updates: true` on the club): an API
 * without the flag shows nothing, so the site is as it was until the server has it.
 */
export const clubUpdatesText = (name) => `Get updates from ${String(name || "").trim() || "this club"} on WhatsApp`;

/** Whether a club offers the box: only an explicit `true` from the API does. */
export const offersClubUpdates = (club) => club?.whatsapp_updates === true;
