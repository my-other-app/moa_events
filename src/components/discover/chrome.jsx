import { SiteFooter } from "./footer";
import { SiteHeader } from "./header";

/*
 * The frame of every public page: the header (search, the account menu,
 * "Get the app"; header.jsx) and the footer (footer.jsx) around the page.
 */
export { SiteFooter, SiteHeader };

/**
 * A discovery page: header, the page, footer. (Next scrolls a new page to
 * the top on navigation, as the old SPA did here by hand.)
 */
export function SitePage({ children }) {
  return (
    <div className="dc-page dc-scope">
      <a className="dc-skip" href="#dc-main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="dc-main" className="dc-main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
