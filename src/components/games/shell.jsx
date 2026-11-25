import { Plus_Jakarta_Sans, Unbounded } from "next/font/google";
import { colorVars, themeOf } from "@/utils/games";

/*
 * The games' type, loaded only on the games' pages (not site-wide):
 * Unbounded for headings, Plus Jakarta Sans for text, self-hosted by
 * next/font like the site's other faces.
 */
const unbounded = Unbounded({ subsets: ["latin"], display: "swap", variable: "--font-unbounded" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--font-jakarta" });

/** The themed frame of every games page: four themes, Neon Arcade by default, an optional accent colour, and (on the venue screen) the organiser's own colours. */
export default function GameShell({ theme, accent = null, colors = null, screen = false, className = "", children }) {
  const custom = colors ? colorVars(colors) : {};
  const style = accent || Object.keys(custom).length ? { ...(accent ? { "--gm-accent": accent } : {}), ...custom } : undefined;
  return (
    <div className={`gm ${screen ? "gm--screen" : ""} ${unbounded.variable} ${jakarta.variable} ${className}`} data-theme={themeOf(theme)} style={style}>
      {children}
    </div>
  );
}
