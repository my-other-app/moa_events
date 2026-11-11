/**
 * What the data deletion page (/data-deletion) says, in the legal texts'
 * format (@/content/legal): a block is ["p", text], ["h3", text],
 * ["ul", [text…]] or ["ol", [text…]]; inside a text **…** is bold and
 * [label](href) a link.
 *
 * Meta asks every app that logs people in with Facebook for a data deletion
 * page and callback (feature-register/social-posting-contract.md): Meta
 * sends people here as /data-deletion?code=<confirmation code> after it has
 * told us to delete what we keep. What it says follows the backend
 * (moa_backend app/api/social: disconnecting deletes the tokens; a deletion
 * request also clears the account's name, handle, picture and the person's
 * Facebook id) and promises nothing more. Drafted 11 Nov 2026 for the owner
 * to approve with the PR that added it.
 */
import { SUPPORT_EMAIL } from "./legal";

const mail = `[${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL})`;

export const DATA_DELETION = {
  key: "data-deletion",
  path: "/data-deletion",
  title: "Data deletion for social accounts",
  description:
    "What MyOtherApp keeps when a club connects a Facebook Page, Instagram, LinkedIn or X account, how to disconnect one, what we delete, and the status of a deletion request.",
  lede: "Clubs on MyOtherApp can connect their Facebook Page, Instagram account, LinkedIn profile or Page, and X account, so that MyOtherApp posts their events there when they ask it to. This page explains what we keep from those accounts, how to disconnect one, and what we delete.",
  sections: [
    {
      id: "what-we-keep",
      heading: "What we keep",
      blocks: [
        ["p", "For each account a club connects, we keep only what we need to post for the club:"],
        [
          "ul",
          [
            "**The account:** the platform's id for the Page or account, its name, its handle and its profile picture, so the club can see which account is connected.",
            "**The keys to post:** the access tokens the platform gives us when the club connects. They are stored encrypted, are never shown to anyone, and are used only to publish the posts the club schedules or approves.",
            "**Who connected it:** for Facebook and Instagram, the id Facebook gives our app for the person who connected the account, so that we can act on their deletion request.",
            "**The posts we publish:** for each post, the platform's id and link for it, when it went out, and whether it worked.",
          ],
        ],
        [
          "p",
          "We don't read or keep the account's messages, followers, comments or anything else it holds, and we never post anything a club didn't schedule or approve. Our [Privacy Policy](/privacy#social-accounts) has the rest.",
        ],
      ],
    },
    {
      id: "disconnect",
      heading: "How a club disconnects an account",
      blocks: [
        ["h3", "In the clubs dashboard"],
        [
          "p",
          "A club's owner or admin opens the [clubs dashboard](https://club-dashboard.myotherapp.in), goes to **Settings → Social accounts**, and chooses **Disconnect** on the account. It is disconnected straight away.",
        ],
        ["h3", "On the platform itself"],
        ["p", "Anyone who connected an account can also take MyOtherApp's access away from the platform's own settings:"],
        [
          "ul",
          [
            "**Facebook and Instagram:** in Facebook's settings, open **Business integrations** (or **Apps and websites**), and remove MyOtherApp. You can also ask Facebook to have us delete your data there.",
            "**LinkedIn:** in LinkedIn's settings, open **Data privacy → Permitted services**, and remove MyOtherApp.",
            "**X:** in X's settings, open **Security and account access → Apps and sessions → Connected apps**, and revoke MyOtherApp.",
          ],
        ],
      ],
    },
    {
      id: "what-we-delete",
      heading: "What we delete",
      blocks: [
        ["p", "When an account is disconnected, in the dashboard or on the platform, or Facebook sends us a deletion request:"],
        [
          "ul",
          [
            "its access tokens are deleted at once, and revoked on the platform where the platform lets us;",
            "posts that were waiting to go out to that account don't go out;",
            "for a deletion request from Facebook, we also clear the account's name, handle and picture, and the Facebook id of the person who connected it.",
          ],
        ],
        [
          "p",
          "Posts already published stay on the platform: they belong to the club's account, and the club can delete them there. In the club's dashboard, the record that a post went out (its platform, its link and when) stays with the event's history, without any keys.",
        ],
      ],
    },
    {
      id: "requests",
      heading: "Deletion requests from Facebook",
      blocks: [
        [
          "p",
          "If you remove MyOtherApp from your Facebook account and ask for your data to be deleted, Facebook tells us, we do all of the above straight away, and Facebook gives you a link to this page with a confirmation code. The status of your request is shown at the top of the page.",
        ],
        ["p", `Anything else, or a request for another platform? Write to us at ${mail} from the email address on your account, and we'll take care of it.`],
      ],
    },
  ],
};
