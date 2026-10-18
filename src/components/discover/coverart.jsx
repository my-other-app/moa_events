/**
 * The art on the drawn covers, as plain SVG elements: the shapes (Motif)
 * and tidySvg, which writes their numbers short. No hooks and no styles, so
 * the share pictures (src/og) draw the same art on the server.
 */
import { cloneElement, isValidElement } from "react";

const RAYS = 20;
const BAR_HEIGHTS = [0.42, 0.6, 0.3, 0.54, 0.36, 0.64, 0.46];

/** A wave across the box at height y, drawn with smooth quadratic segments. */
function wave(y, w, amp, len) {
  let d = `M ${-len} ${y} q ${len / 4} ${-amp} ${len / 2} 0`;
  for (let x = -len / 2; x < w + len; x += len / 2) d += ` t ${len / 2} 0`;
  return d;
}

const round = (n) => Math.round(n * 100) / 100;
const roundIn = (s) => s.replace(/-?\d+\.\d{3,}/g, (x) => String(round(Number(x))));

/**
 * The art with every coordinate at two decimals: the same picture, a
 * fraction of the bytes (a page sends each cover twice, as HTML and as data).
 */
export function tidySvg(node) {
  if (Array.isArray(node)) return node.map(tidySvg);
  if (!isValidElement(node)) return node;
  const props = {};
  for (const [k, v] of Object.entries(node.props)) {
    if (k === "children") continue;
    props[k] = typeof v === "number" ? round(v) : typeof v === "string" && (k === "d" || k === "transform") ? roundIn(v) : v;
  }
  const kids = node.props.children;
  if (kids === undefined) return cloneElement(node, props);
  // A static list of children goes back as children, not as one array (which React would want keys for).
  return Array.isArray(kids) ? cloneElement(node, props, ...kids.map(tidySvg)) : cloneElement(node, props, tidySvg(kids));
}

/** The shape on a generated cover. Everything sits in the top part, leaving the bottom for the date. */
export function Motif({ motif, w, h, c, v, uid }) {
  const m = Math.min(w, h);
  const shift = [0, 0.07, -0.05][v] || 0;
  switch (motif) {
    case "rings": {
      const cx = w * (0.72 + shift);
      const cy = h * 0.26;
      const r = m * 0.19;
      return (
        <g>
          {[2.3, 1.9, 1.5].map((k) => (
            <circle key={k} cx={cx} cy={cy} r={r * k} fill="none" stroke={c.line} strokeWidth={m * 0.012} />
          ))}
          <circle cx={cx} cy={cy} r={r} fill={c.accent} />
          <circle cx={cx - r * 1.9 * 0.72} cy={cy + r * 1.9 * 0.7} r={m * 0.035} fill={c.pop} />
        </g>
      );
    }
    case "grid": {
      const step = m * 0.075;
      return (
        <g>
          <defs>
            <pattern id={`${uid}g`} width={step} height={step} patternUnits="userSpaceOnUse">
              <circle cx={step / 2} cy={step / 2} r={m * 0.009} fill={c.line} />
            </pattern>
          </defs>
          <rect width={w} height={h * 0.64} fill={`url(#${uid}g)`} />
          <circle cx={w * (1 + shift)} cy={0} r={m * 0.72} fill="none" stroke={c.line} strokeWidth={m * 0.012} />
          <circle cx={w * (1 + shift)} cy={0} r={m * 0.56} fill={c.accent} />
          <rect
            x={w * 0.16}
            y={h * 0.24}
            width={m * 0.12}
            height={m * 0.12}
            fill={c.pop}
            transform={`rotate(45 ${w * 0.16 + m * 0.06} ${h * 0.24 + m * 0.06})`}
          />
        </g>
      );
    }
    case "burst": {
      const cx = w * (0.7 + shift);
      const cy = h * 0.28;
      const r1 = m * 0.13;
      const r2 = m * 0.46;
      return (
        <g stroke={c.accent} strokeWidth={m * 0.026} strokeLinecap="round">
          {Array.from({ length: RAYS }, (_, i) => {
            const a = (i / RAYS) * Math.PI * 2;
            const r = i % 2 ? r2 * 0.74 : r2;
            return <line key={i} x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} />;
          })}
          <circle cx={cx} cy={cy} r={m * 0.075} fill={c.pop} stroke="none" />
        </g>
      );
    }
    case "arches": {
      const cx = w * (0.88 + shift / 2);
      const cy = h * 0.5;
      const colors = [c.accent, c.line, c.accent, c.pop];
      return (
        <g>
          <defs>
            <clipPath id={`${uid}a`}>
              <rect width={w} height={cy} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${uid}a)`} fill="none" strokeWidth={m * 0.075}>
            {[0.64, 0.51, 0.38, 0.25].map((k, i) => (
              <circle key={k} cx={cx} cy={cy} r={m * k} stroke={colors[i]} />
            ))}
          </g>
        </g>
      );
    }
    case "bars": {
      const n = BAR_HEIGHTS.length;
      const gap = w * 0.035;
      const x0 = w * 0.2;
      const bw = (w * 0.76 - gap * (n - 1)) / n;
      return (
        <g>
          {BAR_HEIGHTS.map((_, i) => {
            const k = BAR_HEIGHTS[(i + v * 2) % n];
            return <rect key={i} x={x0 + i * (bw + gap)} y={-bw} width={bw} height={h * k * 0.95 + bw} rx={bw / 2} fill={i === 2 + v ? c.pop : c.accent} />;
          })}
        </g>
      );
    }
    case "waves": {
      const len = m * 0.28;
      const amp = m * 0.035;
      return (
        <g fill="none" strokeWidth={m * 0.022} strokeLinecap="round">
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d={wave(h * 0.1 + i * m * 0.075, w, amp, len)} stroke={i === 3 ? c.pop : c.accent} />
          ))}
        </g>
      );
    }
    case "stripes": {
      const cx = w * (0.68 + shift);
      const cy = h * 0.27;
      const s = m * 0.06;
      return (
        <g>
          <defs>
            <pattern id={`${uid}s`} width={s} height={s} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={s / 2} height={s} fill={c.accent} />
            </pattern>
          </defs>
          <circle cx={cx + m * 0.1} cy={cy - m * 0.06} r={m * 0.34} fill="none" stroke={c.line} strokeWidth={m * 0.012} />
          <circle cx={cx} cy={cy} r={m * 0.34} fill={`url(#${uid}s)`} />
          <circle cx={cx - m * 0.3} cy={cy + m * 0.28} r={m * 0.05} fill={c.pop} />
        </g>
      );
    }
    default: {
      // blocks
      const bx = w * (0.48 + shift);
      const size = m * 0.48;
      return (
        <g>
          <rect x={bx} y={-m * 0.08} width={size} height={size} rx={m * 0.06} fill={c.accent} transform={`rotate(14 ${bx + size / 2} ${size / 2})`} />
          <rect
            x={w * 0.26}
            y={h * 0.16}
            width={m * 0.3}
            height={m * 0.3}
            rx={m * 0.05}
            fill="none"
            stroke={c.line}
            strokeWidth={m * 0.014}
            transform={`rotate(-12 ${w * 0.26 + m * 0.15} ${h * 0.16 + m * 0.15})`}
          />
          <circle cx={w * 0.86} cy={h * 0.5} r={m * 0.07} fill={c.pop} />
        </g>
      );
    }
  }
}
