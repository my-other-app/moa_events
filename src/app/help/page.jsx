import { SitePage } from "@/components/discover/chrome";
import { HelpView } from "@/components/help/helppage";
import { pageMetadata } from "@/seo/metadata";
import { getHelpDesk } from "@/server/support";

/*
 * /help: answers, "Ask us" (the support desk's form) and, signed in, "My
 * requests" (feature-register/support-leads-contract.md). SERVER-RENDERED,
 * statically regenerated (ISR, at most once every five minutes): the
 * answers and the form's topics are in the HTML; the form and the list are
 * islands. While the API has no desk (404) the page shows the site's own
 * answers and "Email us" (src/server/support.js); it never fails for the
 * API being down. "Get help" buttons elsewhere open it with what went wrong
 * in the address (?error_code=…&track_id=…&from=…#ask), read in the browser.
 */
export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Help",
  description:
    "Get help with MyOtherApp: answers about tickets, registration, payments and refunds, and your account, and a form to ask our team, who reply by email.",
  path: "/help",
});

export default async function Help() {
  const desk = await getHelpDesk();
  return (
    <SitePage>
      <HelpView desk={desk} />
    </SitePage>
  );
}
