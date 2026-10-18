/**
 * The share pictures, drawn by next/og (Satori): flexbox and inline styles
 * only, no classes. The drawn cover is the same art the site draws for an
 * event without a poster (Motif, from the cards), in the same colours.
 *
 * Pure: every picture is a function of plain data, with remote images
 * already fetched as data: URLs (./assets.js).
 */
import { Motif, tidySvg } from "@/components/discover/coverart";
import { coverLook, dateParts, initials } from "@/utils/cover";

export const INK = "#111827";
export const INK_2 = "#4b5563";
export const INK_3 = "#6b7280";
export const ACCENT = "#F9FFA1";
export const SLATE = "#2c3440";

const clip = (text, max) => {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, "")}…`;
};

/** The drawn art in a box: the palette's gradient and the motif over it. */
function Art({ look, w, h }) {
  return (
    <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: w, height: h, backgroundImage: look.palette.bg }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMin slice" style={{ position: "absolute", top: 0, left: 0 }}>
        <g transform={look.variant === 2 ? `translate(${w} 0) scale(-1 1)` : undefined}>{tidySvg(Motif({ motif: look.motif, w, h, c: look.palette, v: look.variant, uid: "og" }))}</g>
      </svg>
    </div>
  );
}

/** The cover an event without a poster gets: its kind and a big date over the art, as on the site. */
export function EventCoverPanel({ event, w, h }) {
  const look = coverLook({ id: event.id, category: event.category });
  const date = dateParts(event.starts_at);
  const kind = event.category?.name || (event.is_online ? "Online" : "");
  const unit = Math.min(w, h);
  return (
    <div style={{ display: "flex", position: "relative", width: w, height: h, overflow: "hidden", color: look.palette.ink }}>
      <Art look={look} w={w} h={h} />
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: unit * 0.07, right: unit * 0.07, bottom: unit * 0.07 }}>
        {kind ? (
          <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: unit * 0.05, letterSpacing: unit * 0.004, textTransform: "uppercase", color: look.palette.sub }}>{kind}</span>
        ) : null}
        {date ? (
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <span style={{ fontFamily: "Bebas Neue", fontSize: unit * 0.42, lineHeight: 0.8 }}>{date.day}</span>
            <div style={{ display: "flex", flexDirection: "column", marginLeft: unit * 0.035, marginBottom: unit * 0.01, fontFamily: "Bebas Neue", fontSize: unit * 0.11, lineHeight: 0.92 }}>
              <span>{date.month}</span>
              <span style={{ color: look.palette.sub }}>{date.weekday}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Glyph({ name, size = 30, color = INK_2 }) {
  const paths = {
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6.5-8 12-8 12s-8-5.5-8-12a8 8 0 0 1 16 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    monitor: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </>
    ),
    users: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

/** A round logo (a data: URL), or initials on the club's own colour. */
function Logo({ src, name, size, ring = false }) {
  const look = coverLook({ id: name });
  const box = {
    display: "flex",
    width: size,
    height: size,
    borderRadius: size,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    border: ring ? `${Math.round(size * 0.05)}px solid #ffffff` : "none",
    backgroundColor: src ? "#ffffff" : SLATE,
  };
  return (
    <div style={box}>
      {src ? (
        <img src={src} alt="" width={size} height={size} style={{ objectFit: "cover" }} />
      ) : (
        <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: size * 0.4, color: look.palette.name === "citron" ? INK : "#ffffff" }}>{initials(name)}</span>
      )}
    </div>
  );
}

function Fact({ icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", fontSize: 30, color: INK_2 }}>
      <Glyph name={icon} />
      <span style={{ marginLeft: 16 }}>{children}</span>
    </div>
  );
}

const titleSize = (t) => (t.length <= 22 ? 104 : t.length <= 36 ? 88 : t.length <= 56 ? 72 : 60);

/**
 * An event's share picture: the poster (or its drawn cover) on the left,
 * and on the right the club, the name, when and where, and the price.
 *   facts: {when, where, online, price, ended}   already in words
 */
export function EventCard({ event, club, poster, clubLogo, facts }) {
  const title = clip(event.name, 80);
  return (
    <div style={{ display: "flex", width: 1200, height: 630, backgroundColor: "#ffffff", fontFamily: "DM Sans", color: INK }}>
      <div style={{ display: "flex", position: "relative", width: 504, height: 630, overflow: "hidden" }}>
        {poster ? <img src={poster} alt="" width={504} height={630} style={{ objectFit: "cover" }} /> : <EventCoverPanel event={event} w={504} h={630} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: "52px 56px 46px" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {club ? (
            <div style={{ display: "flex", alignItems: "center" }}>
              <Logo src={clubLogo} name={club.name} size={52} />
              <span style={{ marginLeft: 16, fontSize: 28, fontWeight: 700, color: INK_2 }}>{clip(club.name, 34)}</span>
            </div>
          ) : null}
          <div style={{ display: "flex", marginTop: 26, fontFamily: "Bebas Neue", fontSize: titleSize(title), lineHeight: 0.95, color: INK }}>{title}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {facts.when ? <Fact icon="calendar">{facts.when}</Fact> : null}
          {facts.where ? (
            <div style={{ display: "flex", marginTop: 14 }}>
              <Fact icon={facts.online ? "monitor" : "pin"}>{clip(facts.where, 38)}</Fact>
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 30 }}>
            <div style={{ display: "flex" }}>
              <span style={{ display: "flex", backgroundColor: ACCENT, color: INK, fontSize: 28, fontWeight: 700, padding: "8px 22px", borderRadius: 999 }}>{facts.price}</span>
              {facts.ended ? (
                <span style={{ display: "flex", marginLeft: 12, backgroundColor: "#e5e7eb", color: INK_2, fontSize: 28, fontWeight: 700, padding: "8px 22px", borderRadius: 999 }}>Ended</span>
              ) : null}
            </div>
            <span style={{ fontFamily: "Bebas Neue", fontSize: 40, color: INK }}>MyOtherApp</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A club's share picture: its cover (or the art drawn for it) across the
 * top, the logo over its edge, the name, the tagline and how alive it is.
 *   facts: {place, followers, upcoming}   already in words
 */
export function ClubCard({ club, cover, logo, facts }) {
  const look = coverLook({ id: club.slug || club.id || club.name });
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 1200, height: 630, backgroundColor: "#ffffff", fontFamily: "DM Sans", color: INK }}>
      <div style={{ display: "flex", position: "relative", width: 1200, height: 250, overflow: "hidden" }}>
        {cover ? <img src={cover} alt="" width={1200} height={250} style={{ objectFit: "cover" }} /> : <Art look={look} w={1200} h={250} />}
      </div>
      <div style={{ display: "flex", flex: 1, padding: "0 64px 44px", position: "relative" }}>
        <div style={{ display: "flex", position: "absolute", top: -84, left: 64 }}>
          <Logo src={logo} name={club.name} size={168} ring />
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", flex: 1, paddingTop: 100 }}>
          <div style={{ display: "flex", fontFamily: "Bebas Neue", fontSize: club.name.length > 28 ? 76 : 96, lineHeight: 0.95 }}>{clip(club.name, 44)}</div>
          {club.tagline ? <div style={{ display: "flex", marginTop: 10, fontSize: 32, color: INK_2 }}>{clip(club.tagline, 70)}</div> : null}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 26 }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: 28, color: INK_3 }}>
              {[facts.place, facts.followers, facts.upcoming].filter(Boolean).join("  ·  ")}
            </div>
            <span style={{ fontFamily: "Bebas Neue", fontSize: 40, color: INK }}>MyOtherApp</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Ink or white, whichever reads better on a colour (#rgb or #rrggbb). */
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return "#ffffff";
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // White text needs about 4.5:1 for small words; the big name reads at less.
  return (1.05 / (lum + 0.05)) >= 3 ? "#ffffff" : INK;
}

const topicTitleSize = (t) => (t.length <= 12 ? 168 : t.length <= 20 ? 136 : 104);

/**
 * A topic's share picture: its colour, its name large, its words, a few of
 * its interests, and how many events and clubs it has (when counted).
 *   facts: {events, clubs}   already in words, or null
 */
export function TopicCard({ topic, facts }) {
  const bg = topic.color || SLATE;
  const ink = inkOn(bg);
  const soft = ink === INK ? "rgba(17,24,39,0.72)" : "rgba(255,255,255,0.86)";
  const name = clip(topic.name, 30);
  const interests = topic.interests.slice(0, 6).map((i) => clip(i.name, 24));
  const more = topic.interests.length - interests.length;
  const line = [facts.events, facts.clubs].filter(Boolean).join("  ·  ");
  return (
    <div style={{ display: "flex", position: "relative", width: 1200, height: 630, backgroundColor: bg, fontFamily: "DM Sans", color: ink, overflow: "hidden" }}>
      <div style={{ display: "flex", position: "absolute", width: 560, height: 560, right: -140, top: -180, borderRadius: 560, backgroundColor: ink === INK ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.10)" }} />
      <div style={{ display: "flex", position: "absolute", width: 300, height: 300, right: 120, bottom: -170, borderRadius: 300, backgroundColor: ink === INK ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.07)" }} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 1200, height: 630, padding: "56px 64px 48px" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 700, fontSize: 26, letterSpacing: 3, textTransform: "uppercase", color: soft }}>Topic</span>
          <div style={{ display: "flex", marginTop: 10, fontFamily: "Bebas Neue", fontSize: topicTitleSize(name), lineHeight: 0.92 }}>{name}</div>
          {topic.description ? <div style={{ display: "flex", marginTop: 14, maxWidth: 940, fontSize: 32, lineHeight: 1.3, color: soft }}>{clip(topic.description, 120)}</div> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {interests.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", maxWidth: 1000 }}>
              {interests.map((label, i) => (
                <span key={i} style={{ display: "flex", marginRight: 12, marginTop: 12, padding: "8px 20px", borderRadius: 999, backgroundColor: "#ffffff", color: INK, fontSize: 26, fontWeight: 700 }}>
                  {label}
                </span>
              ))}
              {more > 0 ? <span style={{ display: "flex", marginTop: 12, padding: "8px 8px", fontSize: 26, fontWeight: 700, color: soft }}>+{more} more</span> : null}
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 30 }}>
            <span style={{ display: "flex", fontSize: 28, color: soft }}>{line}</span>
            <span style={{ fontFamily: "Bebas Neue", fontSize: 44 }}>MyOtherApp</span>
          </div>
        </div>
      </div>
    </div>
  );
}
