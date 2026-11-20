import { Inter, Noto_Sans, Poppins, Space_Grotesk } from "next/font/google";

/*
 * The faces a live theme may name besides the site's own two (DM Sans and
 * Bebas Neue, set up in src/app/layout.jsx): self-hosted by next/font, as
 * the site's policy allows no font from elsewhere. None is preloaded: the
 * @font-face rules are a few hundred bytes, and a face is fetched only when
 * a themed room actually sets text in it. While it loads (or if it never
 * does) the text shows in DM Sans (src/utils/liveTheme.js).
 */
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap", preload: false, variable: "--font-poppins" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-space-grotesk" });
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-inter" });
const notoSans = Noto_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-noto-sans" });

/** The classes that define the faces' variables, for the themed page's root. */
export const themeFontVariables = [poppins, spaceGrotesk, inter, notoSans].map((f) => f.variable).filter(Boolean).join(" ");
