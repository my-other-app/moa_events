import { Bebas_Neue, DM_Sans, Inter } from "next/font/google";
import { SITE_URL } from "@/config";
import { DEFAULT_DESCRIPTION, HOME_TITLE, OG_IMAGE, SITE_NAME, TITLE_TEMPLATE } from "@/seo/metadata";
import Providers from "./providers";

/*
 * Every stylesheet, once, in the order the old single bundle had them (the
 * cascade depends on it). Components no longer import their own.
 */
import "@/index.css";
import "@/styles/legacy-base.css";
import "@/styles/discover.css";
import "@/styles/account.css";
import "@/styles/signin-email.css";
import "@/styles/cards-hero.css";
import "@/styles/event-page.css";
import "@/styles/register.css";
import "@/styles/ticket.css";
import "@/styles/registerbutton.css";
import "@/styles/download.css";
import "@/styles/certificate.css";
import "@/styles/notfound.css";
import "@/styles/live.css";
import "@/styles/compete.css";
import "@/styles/calendar.css";
import "@/styles/pages.css";
import "@/styles/forclubs.css";
import "@/styles/pricing.css";

/*
 * The site's type, self-hosted by next/font with size-adjusted fallbacks so
 * nothing moves when it arrives. Only Latin is preloaded; the other subsets
 * (Latin Extended has the ₹) are declared and load when a page uses them.
 * No italics: the site sets none (every <em> is upright). The stylesheets
 * name them through these variables (--dc-font, --dc-display and friends).
 */
const dmSans = DM_Sans({ subsets: ["latin"], style: ["normal"], axes: ["opsz"], display: "swap", variable: "--font-dm-sans" });
const bebasNeue = Bebas_Neue({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-bebas-neue" });
// Only the live room and play use Inter: not preloaded on every page.
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], display: "swap", variable: "--font-inter", preload: false });

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: HOME_TITLE, template: TITLE_TEMPLATE },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: { icon: [{ url: "/logo.svg", type: "image/svg+xml" }] },
  openGraph: {
    siteName: SITE_NAME,
    locale: "en_IN",
    type: "website",
    title: HOME_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", title: HOME_TITLE, description: DEFAULT_DESCRIPTION, images: [OG_IMAGE.url] },
};

export const viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${bebasNeue.variable} ${inter.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
