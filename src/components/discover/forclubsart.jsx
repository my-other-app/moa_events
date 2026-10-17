import { useId } from "react";
import { COVER_PALETTES } from "@/utils/cover";

/*
 * The drawings on the For clubs page: flat shapes in the site's colours, in
 * the family of the covers we draw for events without a poster. They are
 * pictures of the ideas — a ticket, a certificate, a door — never pictures
 * of the dashboard, so nothing here pretends to be a screenshot. All of it
 * is decorative; the words beside it say the thing.
 */

const INK = "#111827";
const SLATE = "#2c3440";
const YELLOW = "#f9ffa1";
const SKY = "#0284c7";
const SKY_LIGHT = "#38bdf8";
const LINE = "#e5e7eb";
const SUNKEN = "#f3f4f6";
const palette = (name) => COVER_PALETTES.find((p) => p.name === name) || COVER_PALETTES[0];

const useUid = () => `fc${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

/** A drawn QR code: three finder squares and a scatter of modules, the same every time for a seed. */
function Qr({ x, y, size, seed = 1, fill = INK, n = 11 }) {
  const m = size / n;
  const finder = (i, j) => (i < 4 && j < 4) || (i < 4 && j > n - 5) || (i > n - 5 && j < 4);
  const cells = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (finder(i, j)) continue;
      const h = (Math.imul(i + 3, 2654435761) ^ Math.imul(j + 11, 40503) ^ Math.imul(seed, 97)) >>> 0;
      if (h % 100 < 46) cells.push([i, j]);
    }
  }
  const eye = (cx, cy) => (
    <g key={`${cx}-${cy}`}>
      <rect x={x + cx * m + m * 0.45} y={y + cy * m + m * 0.45} width={m * 2.1} height={m * 2.1} fill="none" stroke={fill} strokeWidth={m * 0.9} />
      <rect x={x + cx * m + m} y={y + cy * m + m} width={m} height={m} fill={fill} />
    </g>
  );
  return (
    <g>
      {eye(0, 0)}
      {eye(n - 3, 0)}
      {eye(0, n - 3)}
      {cells.map(([i, j]) => (
        <rect key={`${i}-${j}`} x={x + j * m} y={y + i * m} width={m} height={m} fill={fill} />
      ))}
    </g>
  );
}

/** A four-pointed spark, as on the home page. */
const Spark = ({ x, y, r, fill = INK }) => (
  <path d={`M${x} ${y - r} L${x + r * 0.15} ${y - r * 0.15} L${x + r} ${y} L${x + r * 0.15} ${y + r * 0.15} L${x} ${y + r} L${x - r * 0.15} ${y + r * 0.15} L${x - r} ${y} L${x - r * 0.15} ${y - r * 0.15} Z`} fill={fill} />
);

function Shadow({ id, opacity = 0.18 }) {
  return (
    <filter id={id} x="-25%" y="-25%" width="150%" height="160%">
      <feDropShadow dx="0" dy="12" stdDeviation="12" floodColor={INK} floodOpacity={opacity} />
    </filter>
  );
}

/* ---------- the hero's three tiles ---------- */

function TileFrame({ name, children }) {
  const p = palette(name);
  return (
    <div className={`dc-cover dc-cover--${p.name}`} style={{ background: p.bg }}>
      <svg className="dc-cover-art" viewBox="0 0 100 125" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        {children}
      </svg>
    </div>
  );
}

/** A QR ticket, just scanned. */
export function TicketTile() {
  const uid = useUid();
  return (
    <TileFrame name="night">
      <defs>
        <mask id={`${uid}n`}>
          <rect width="100" height="125" fill="#fff" />
          <circle cx="18" cy="80" r="5" fill="#000" />
          <circle cx="82" cy="80" r="5" fill="#000" />
        </mask>
      </defs>
      <circle cx="16" cy="112" r="26" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.2" />
      <g transform="rotate(-6 50 64)">
        <rect x="18" y="18" width="64" height="94" rx="6" fill={YELLOW} mask={`url(#${uid}n)`} />
        <Qr x={29} y={28} size={42} seed={4} />
        <line x1="25" y1="80" x2="75" y2="80" stroke={INK} strokeOpacity="0.35" strokeWidth="1.2" strokeDasharray="2 2.6" />
        <rect x="28" y="88" width="32" height="4.5" rx="2" fill={INK} />
        <rect x="28" y="96" width="20" height="3.2" rx="1.6" fill={INK} opacity="0.4" />
      </g>
      <circle cx="80" cy="21" r="11" fill={SKY_LIGHT} stroke={SLATE} strokeWidth="2" />
      <polyline points="74.6,21.2 78.6,25.2 85.6,17.4" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </TileFrame>
  );
}

/** A certificate with its seal. */
export function CertificateTile() {
  return (
    <TileFrame name="citron">
      <circle cx="88" cy="14" r="24" fill="none" stroke="rgba(17,24,39,0.16)" strokeWidth="1.2" />
      <g transform="rotate(4 50 62)">
        <rect x="15" y="20" width="70" height="86" rx="3" fill="#fff" />
        <rect x="19" y="24" width="62" height="78" fill="none" stroke={SLATE} strokeWidth="1.1" />
        <rect x="33" y="34" width="34" height="4" rx="1" fill={SLATE} opacity="0.5" />
        <rect x="25" y="44" width="50" height="7" rx="1.5" fill={INK} />
        <rect x="29" y="57" width="42" height="2.4" rx="1.2" fill={INK} opacity="0.22" />
        <rect x="33" y="62.5" width="34" height="2.4" rx="1.2" fill={INK} opacity="0.22" />
        <path d="M25 86 c2.4 -5 4.8 4 7.2 -0.5 s4.6 -4.2 7 0.6 s3.4 1.5 5.2 -1.6" fill="none" stroke={INK} strokeWidth="1.2" strokeLinecap="round" />
        <line x1="24" y1="90" x2="46" y2="90" stroke={INK} strokeOpacity="0.3" strokeWidth="0.8" />
        <path d="M62 90 L58.5 104 L63 101 L66 105 L68.5 92 Z" fill={SKY} />
        <path d="M70 90 L73.5 104 L69 101 L66 105 L63.5 92 Z" fill={SKY} />
        <circle cx="66" cy="86" r="9" fill={SKY} />
        <circle cx="66" cy="86" r="5.6" fill="none" stroke="#fff" strokeWidth="0.9" strokeDasharray="1.4 1.6" />
      </g>
    </TileFrame>
  );
}

/** A live poll, the winning answer in yellow. */
export function PollTile() {
  const bars = [
    [56, false],
    [30, false],
    [70, true],
    [20, false],
  ];
  return (
    <TileFrame name="sky">
      <circle cx="90" cy="112" r="28" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" />
      <path d="M14 14 h62 a6 6 0 0 1 6 6 v12 a6 6 0 0 1 -6 6 h-46 l-8 7 v-7 h-2 a6 6 0 0 1 -6 -6 v-12 a6 6 0 0 1 6 -6 z" fill="#fff" />
      <rect x="20" y="21" width="44" height="4" rx="2" fill={INK} />
      <rect x="20" y="29" width="28" height="3.2" rx="1.6" fill={INK} opacity="0.4" />
      {bars.map(([w, win], i) => (
        <g key={i}>
          <rect x="12" y={56 + i * 15} width="76" height="10" rx="5" fill="rgba(255,255,255,0.16)" />
          <rect x="12" y={56 + i * 15} width={w} height="10" rx="5" fill={win ? YELLOW : "rgba(255,255,255,0.55)"} />
          {win ? <circle cx={12 + w - 5} cy={61 + i * 15} r="2.2" fill={INK} /> : null}
        </g>
      ))}
    </TileFrame>
  );
}

const TILES = [
  { Art: TicketTile, name: "QR tickets", sub: "Scanned at the door" },
  { Art: CertificateTile, name: "Certificates", sub: "Designed by you" },
  { Art: PollTile, name: "Live room", sub: "Quiz, polls and Q&A" },
];

/** The hero's picture: the home page's sun and fan, with three of the things a club runs instead of events. */
export function HeroFan() {
  return (
    <div className="dc-hero2-visual fc-hero-visual" aria-hidden="true">
      <span className="dc-hero2-sun" />
      <span className="dc-hero2-dots" />
      <svg className="dc-hero2-spark" viewBox="0 0 40 40" focusable="false">
        <path d="M20 2 L23 17 L38 20 L23 23 L20 38 L17 23 L2 20 L17 17 Z" />
      </svg>
      <div className="dc-fan dc-fan--3">
        {TILES.map((tile, i) => {
          const Art = tile.Art;
          return (
            <span key={tile.name} className={`dc-fan-slot dc-fan-slot--${i + 1}`}>
              <span className="dc-fan-tile">
                <span className="dc-fan-media">
                  <Art />
                </span>
                <span className="dc-fan-caption">
                  <span className="dc-fan-name">{tile.name}</span>
                  <span className="dc-fan-club">
                    <span>{tile.sub}</span>
                  </span>
                </span>
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- the big drawings beside each part of the page ---------- */

/** Before: a poster, a sign-up form with a choice picked, a tracking link that's working, a QR to print. */
function BeforeArt() {
  const uid = useUid();
  return (
    <>
      <defs>
        <Shadow id={`${uid}s`} />
        <pattern id={`${uid}d`} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="1.6" fill={SKY} opacity="0.35" />
        </pattern>
        <clipPath id={`${uid}c`}>
          <rect x="80" y="100" width="140" height="130" rx="8" />
        </clipPath>
      </defs>
      <rect x="22" y="26" width="126" height="98" fill={`url(#${uid}d)`} />
      <circle cx="262" cy="64" r="11" fill={YELLOW} stroke={INK} strokeWidth="2" />

      <g transform="rotate(-6 150 205)" filter={`url(#${uid}s)`}>
        <rect x="70" y="90" width="160" height="222" rx="12" fill="#fff" />
        <g clipPath={`url(#${uid}c)`}>
          <rect x="80" y="100" width="140" height="130" fill={SLATE} />
          <circle cx="186" cy="140" r="62" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
          <circle cx="186" cy="140" r="48" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
          <circle cx="186" cy="140" r="32" fill={YELLOW} />
          <circle cx="128" cy="192" r="8" fill={SKY_LIGHT} />
        </g>
        <rect x="84" y="246" width="112" height="13" rx="3" fill={INK} />
        <rect x="84" y="266" width="74" height="8" rx="3" fill={INK} opacity="0.3" />
        <rect x="84" y="284" width="62" height="18" rx="9" fill={YELLOW} stroke={INK} strokeWidth="1.5" />
      </g>

      <g transform="rotate(8 72 330)" filter={`url(#${uid}s)`}>
        <rect x="38" y="296" width="70" height="70" rx="10" fill="#fff" />
        <Qr x={47} y={305} size={52} seed={9} />
      </g>

      <g transform="rotate(4 375 225)" filter={`url(#${uid}s)`}>
        <rect x="270" y="98" width="210" height="252" rx="14" fill="#fff" />
        <rect x="292" y="120" width="98" height="12" rx="3" fill={INK} />
        <rect x="292" y="139" width="142" height="6" rx="3" fill={INK} opacity="0.22" />
        <rect x="292" y="163" width="58" height="6" rx="3" fill={INK} opacity="0.45" />
        <rect x="292" y="175" width="166" height="26" rx="6" fill="none" stroke="#d1d5db" strokeWidth="2" />
        <line x1="302" y1="182" x2="302" y2="194" stroke={SKY} strokeWidth="2" />
        <rect x="292" y="215" width="84" height="6" rx="3" fill={INK} opacity="0.45" />
        {[
          [235, 70, false],
          [253, 92, true],
          [271, 56, false],
        ].map(([cy, w, on]) => (
          <g key={cy}>
            <circle cx="300" cy={cy} r="6.5" fill={on ? SKY : "#fff"} stroke={on ? SKY : "#9ca3af"} strokeWidth="2" />
            {on ? <circle cx="300" cy={cy} r="2.4" fill="#fff" /> : null}
            <rect x="314" y={cy - 3} width={w} height="6" rx="3" fill={INK} opacity={on ? 0.8 : 0.25} />
          </g>
        ))}
        <rect x="292" y="296" width="166" height="34" rx="6" fill={SLATE} />
        <rect x="346" y="310" width="58" height="6" rx="3" fill="#fff" />
      </g>

      <g transform="rotate(-3 463 70)" filter={`url(#${uid}s)`}>
        <rect x="388" y="40" width="152" height="60" rx="14" fill="#fff" />
        <g transform="translate(400 54) scale(1.25)" fill="none" stroke={SKY} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </g>
        <rect x="440" y="56" width="52" height="6" rx="3" fill={INK} opacity="0.3" />
        <polyline points="440,86 456,80 470,83 486,72 500,74 520,58" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="520" cy="58" r="4.5" fill={YELLOW} stroke={INK} strokeWidth="1.8" />
      </g>
      <Spark x={522} y={346} r={13} />
    </>
  );
}

/** On the day: a phone scanning a ticket, a kiosk at the door, an ID card on its lanyard. */
function DayArt() {
  const uid = useUid();
  const corner = (x, y, dx, dy) => <path d={`M${x} ${y + dy * 14} V${y} H${x + dx * 14}`} fill="none" stroke={YELLOW} strokeWidth="4" strokeLinecap="round" />;
  return (
    <>
      <defs>
        <Shadow id={`${uid}s`} opacity={0.35} />
        <clipPath id={`${uid}card`}>
          <rect x="402" y="158" width="118" height="168" rx="12" />
        </clipPath>
      </defs>
      <circle cx="282" cy="204" r="172" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" strokeDasharray="4 7" />
      <circle cx="282" cy="204" r="128" fill={YELLOW} />

      <g filter={`url(#${uid}s)`}>
        <rect x="124" y="246" width="12" height="94" fill="#cbd5e1" />
        <rect x="94" y="334" width="72" height="10" rx="5" fill="#e5e7eb" />
        <rect x="62" y="148" width="136" height="104" rx="12" fill={INK} stroke="#fff" strokeWidth="3" />
        <rect x="72" y="158" width="116" height="84" rx="5" fill={SKY} />
        <rect x="108" y="166" width="44" height="44" rx="4" fill="#fff" />
        <Qr x={111} y={169} size={38} seed={2} />
        <rect x="98" y="220" width="64" height="7" rx="3.5" fill="rgba(255,255,255,0.75)" />
      </g>

      <g transform="rotate(-8 286 196)" filter={`url(#${uid}s)`}>
        <rect x="226" y="72" width="120" height="240" rx="22" fill={INK} stroke="#fff" strokeWidth="3" />
        <rect x="236" y="90" width="100" height="206" rx="12" fill="#1f2937" />
        <rect x="269" y="80" width="34" height="5" rx="2.5" fill="#374151" />
        <rect x="256" y="140" width="60" height="60" rx="4" fill="#fff" />
        <Qr x={259} y={143} size={54} seed={6} />
        {corner(248, 132, 1, 1)}
        {corner(324, 132, -1, 1)}
        {corner(248, 208, 1, -1)}
        {corner(324, 208, -1, -1)}
        <rect x="258" y="232" width="56" height="8" rx="4" fill={YELLOW} />
        <rect x="264" y="248" width="44" height="5" rx="2.5" fill="rgba(255,255,255,0.4)" />
      </g>
      <circle cx="344" cy="276" r="26" fill={SKY_LIGHT} stroke={SLATE} strokeWidth="5" />
      <polyline points="331,277 340,286 357,267" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />

      <path d="M424 12 L452 152 M500 12 L470 152" fill="none" stroke={SKY_LIGHT} strokeWidth="8" strokeLinecap="round" />
      <g transform="rotate(6 461 242)" filter={`url(#${uid}s)`}>
        <rect x="448" y="146" width="26" height="16" rx="3" fill="#cbd5e1" />
        <rect x="402" y="158" width="118" height="168" rx="12" fill="#fff" />
        <g clipPath={`url(#${uid}card)`}>
          <rect x="402" y="158" width="118" height="34" fill={SLATE} />
        </g>
        <rect x="446" y="170" width="30" height="5" rx="2.5" fill={YELLOW} />
        <circle cx="461" cy="212" r="22" fill={SUNKEN} stroke="#fff" strokeWidth="3" />
        <circle cx="461" cy="206" r="8" fill="#9ca3af" />
        <path d="M447 226 a14 11 0 0 1 28 0 z" fill="#9ca3af" />
        <rect x="425" y="244" width="72" height="9" rx="3" fill={INK} />
        <rect x="437" y="259" width="48" height="6" rx="3" fill={INK} opacity="0.35" />
        <Qr x={445} y={276} size={32} seed={12} />
      </g>
      <Spark x={60} y={60} r={14} fill={YELLOW} />
      <Spark x={524} y={356} r={10} fill="#fff" />
    </>
  );
}

/** After: the certificate going out by email, and the report on how it went. */
function AfterArt() {
  const uid = useUid();
  const bars = [44, 66, 36, 82, 58, 70];
  return (
    <>
      <defs>
        <Shadow id={`${uid}s`} />
        <pattern id={`${uid}d`} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="1.6" fill={INK} opacity="0.2" />
        </pattern>
      </defs>
      <rect x="424" y="300" width="112" height="84" fill={`url(#${uid}d)`} />

      <g transform="rotate(6 400 180)" filter={`url(#${uid}s)`}>
        <rect x="300" y="44" width="204" height="270" rx="12" fill="#fff" />
        <rect x="322" y="66" width="92" height="11" rx="3" fill={INK} />
        <rect x="322" y="84" width="132" height="5" rx="2.5" fill={INK} opacity="0.25" />
        <circle cx="358" cy="146" r="30" fill="none" stroke={LINE} strokeWidth="12" />
        <circle cx="358" cy="146" r="30" fill="none" stroke={SKY} strokeWidth="12" strokeDasharray="141 189" transform="rotate(-90 358 146)" />
        <rect x="404" y="128" width="74" height="7" rx="3.5" fill={INK} />
        <rect x="404" y="143" width="52" height="6" rx="3" fill={INK} opacity="0.3" />
        <rect x="404" y="157" width="62" height="6" rx="3" fill={INK} opacity="0.3" />
        {bars.map((h, i) => (
          <rect key={i} x={324 + i * 27} y={290 - h} width="18" height={h} rx="4" fill={i === 3 ? SKY : SLATE} />
        ))}
        <line x1="318" y1="291" x2="486" y2="291" stroke={LINE} strokeWidth="2" />
      </g>

      <g transform="rotate(-10 116 86)" filter={`url(#${uid}s)`}>
        <rect x="60" y="50" width="112" height="74" rx="9" fill={SKY} />
        <polyline points="62,54 116,94 170,54" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="168" cy="52" r="11" fill={YELLOW} stroke={SLATE} strokeWidth="3" />
      </g>

      <g transform="rotate(-4 212 238)" filter={`url(#${uid}s)`}>
        <rect x="56" y="134" width="312" height="212" rx="6" fill="#fff" />
        <rect x="66" y="144" width="292" height="192" fill="none" stroke={SLATE} strokeWidth="2.5" />
        <rect x="73" y="151" width="278" height="178" fill="none" stroke={SLATE} strokeOpacity="0.3" strokeWidth="1" />
        <rect x="172" y="168" width="80" height="6" rx="3" fill={INK} opacity="0.4" />
        <rect x="142" y="182" width="140" height="15" rx="3" fill={SLATE} />
        <rect x="122" y="212" width="180" height="18" rx="4" fill={INK} />
        <line x1="110" y1="238" x2="314" y2="238" stroke={INK} strokeOpacity="0.2" strokeWidth="1.5" />
        <rect x="132" y="250" width="160" height="5" rx="2.5" fill={INK} opacity="0.2" />
        <rect x="152" y="262" width="120" height="5" rx="2.5" fill={INK} opacity="0.2" />
        <path d="M92 304 c4 -9 8 7 12 -1 s8 -7 12 1 s6 3 9 -2 s5 -4 9 1" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        <line x1="88" y1="314" x2="162" y2="314" stroke={INK} strokeOpacity="0.3" strokeWidth="1.5" />
        <Qr x={192} y={286} size={34} seed={21} />
        <path d="M300 306 L292 334 L301 329 L306 337 L311 312 Z" fill={SKY} />
        <path d="M322 306 L330 334 L321 329 L316 337 L311 312 Z" fill={SKY} />
        <circle cx="311" cy="298" r="24" fill={YELLOW} stroke={INK} strokeWidth="2.5" />
        <circle cx="311" cy="298" r="15" fill="none" stroke={INK} strokeWidth="1.5" strokeDasharray="2 3" />
      </g>
      <Spark x={34} y={340} r={13} />
    </>
  );
}

/** All year: the club's own website at its address, a thread with a poll, and the team with their roles. */
function YearArt() {
  const uid = useUid();
  return (
    <>
      <defs>
        <Shadow id={`${uid}s`} opacity={0.3} />
        <clipPath id={`${uid}win`}>
          <rect x="66" y="70" width="384" height="276" rx="14" />
        </clipPath>
        <clipPath id={`${uid}hero`}>
          <rect x="82" y="124" width="352" height="100" rx="8" />
        </clipPath>
        <pattern id={`${uid}d`} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="1.6" fill="#fff" opacity="0.3" />
        </pattern>
      </defs>
      <rect x="18" y="290" width="98" height="98" fill={`url(#${uid}d)`} />

      <g filter={`url(#${uid}s)`}>
        <rect x="66" y="70" width="384" height="276" rx="14" fill="#fff" />
        <g clipPath={`url(#${uid}win)`}>
          <rect x="66" y="70" width="384" height="40" fill={SUNKEN} />
        </g>
        {[88, 104, 120].map((cx) => (
          <circle key={cx} cx={cx} cy="90" r="5" fill="#d1d5db" />
        ))}
        <rect x="142" y="79" width="236" height="22" rx="11" fill="#fff" stroke={LINE} />
        <text x="158" y="94.5" className="fc-art-url" fill="#4b5563">
          <tspan fill={INK} fontWeight="700">
            yourclub
          </tspan>
          .myotherapp.in
        </text>
        <g clipPath={`url(#${uid}hero)`}>
          <rect x="82" y="124" width="352" height="100" fill={SLATE} />
          <circle cx="386" cy="150" r="64" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
          <circle cx="386" cy="150" r="42" fill={YELLOW} />
          <circle cx="330" cy="206" r="7" fill={SKY_LIGHT} />
        </g>
        <rect x="100" y="148" width="124" height="14" rx="3" fill="#fff" />
        <rect x="100" y="170" width="82" height="8" rx="3" fill="rgba(255,255,255,0.5)" />
        <rect x="100" y="191" width="64" height="18" rx="9" fill={YELLOW} />
        {[
          [82, "#c4e8fb"],
          [202, "#fbffc8"],
          [322, LINE],
        ].map(([x, top]) => (
          <g key={x}>
            <rect x={x} y="236" width="112" height="94" rx="8" fill={SUNKEN} />
            <rect x={x} y="236" width="112" height="48" rx="8" fill={top} />
            <rect x={x} y="276" width="112" height="8" fill={top} />
            <rect x={x + 10} y="296" width="76" height="7" rx="3" fill={INK} />
            <rect x={x + 10} y="310" width="50" height="5" rx="2.5" fill={INK} opacity="0.3" />
          </g>
        ))}
      </g>

      <g transform="rotate(3 470 300)" filter={`url(#${uid}s)`}>
        <rect x="384" y="238" width="156" height="128" rx="14" fill="#fff" />
        <circle cx="406" cy="262" r="12" fill={SLATE} />
        <circle cx="406" cy="262" r="4.5" fill={YELLOW} />
        <rect x="426" y="255" width="70" height="6" rx="3" fill={INK} />
        <rect x="426" y="266" width="44" height="5" rx="2.5" fill={INK} opacity="0.3" />
        <rect x="398" y="286" width="128" height="14" rx="7" fill={SUNKEN} />
        <rect x="398" y="286" width="90" height="14" rx="7" fill={YELLOW} />
        <rect x="398" y="306" width="128" height="14" rx="7" fill={SUNKEN} />
        <rect x="398" y="306" width="46" height="14" rx="7" fill="#c4e8fb" />
        <rect x="398" y="336" width="32" height="6" rx="3" fill={INK} opacity="0.25" />
        <rect x="438" y="336" width="24" height="6" rx="3" fill={INK} opacity="0.25" />
      </g>

      <g transform="rotate(-4 470 74)" filter={`url(#${uid}s)`}>
        <rect x="404" y="22" width="132" height="106" rx="14" fill="#fff" />
        {[
          [46, SKY, "Admin"],
          [74, SLATE, "Editor"],
          [102, YELLOW, "Door"],
        ].map(([cy, fill, role]) => (
          <g key={role}>
            <circle cx="428" cy={cy} r="10" fill={fill} stroke={fill === YELLOW ? INK : "none"} strokeWidth="1.5" />
            <rect x="446" y={cy - 9} width="56" height="18" rx="9" fill={SUNKEN} />
            <text x="474" y={cy + 3.8} textAnchor="middle" className="fc-art-role" fill={INK}>
              {role}
            </text>
          </g>
        ))}
      </g>
      <Spark x={36} y={46} r={14} fill={YELLOW} />
    </>
  );
}

const ARTS = { before: BeforeArt, day: DayArt, after: AfterArt, year: YearArt };

/** The drawing for a part of the page, on its own coloured panel. */
export function PhaseArt({ name }) {
  const Art = ARTS[name];
  if (!Art) return null;
  return (
    <div className={`fc-art fc-art--${name}`} aria-hidden="true">
      <svg viewBox="0 0 560 400" preserveAspectRatio="xMidYMid meet" focusable="false">
        <Art />
      </svg>
    </div>
  );
}
