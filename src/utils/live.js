/**
 * Who this browser is in the live room.
 *
 * Nobody needs an account to ask, vote or answer a poll: the browser makes
 * itself a key once and sends it on every call. The quiz hands out a second
 * key per event when the person joins with the code on the screen.
 */
const KEY = "moa.live.key";

const random = () => {
  const bytes = new Uint8Array(18);
  (globalThis.crypto || {}).getRandomValues?.(bytes);
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
};

export function liveKey() {
  try {
    let k = localStorage.getItem(KEY);
    if (!k || k.length < 8) {
      k = random();
      localStorage.setItem(KEY, k);
    }
    return k;
  } catch {
    return random();
  }
}

const playerStorage = (eventId) => `moa.live.player.${eventId}`;

export function rememberPlayer(eventId, player) {
  try {
    localStorage.setItem(playerStorage(eventId), JSON.stringify(player));
  } catch {
    /* private mode: the game still plays for this page load */
  }
}

export function currentPlayer(eventId) {
  try {
    const raw = localStorage.getItem(playerStorage(eventId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function forgetPlayer(eventId) {
  try {
    localStorage.removeItem(playerStorage(eventId));
  } catch {
    /* nothing to forget */
  }
}

/** Whether the room has anything worth a strip on the event page. */
export function roomIsActive(feed) {
  if (!feed) return false;
  return Boolean(feed.banner || feed.poll || feed.quiz?.live || (feed.questions && feed.questions.length > 0));
}
