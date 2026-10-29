/**
 * What the Support page (/support) says, as plain data in the legal texts'
 * format (@/content/legal): a block is ["p", text], ["h3", text],
 * ["ul", [text…]] or ["ol", [text…]], and inside a text **…** is bold and
 * [label](href) is a link.
 *
 * It is the "Support URL" given to the App Store, and
 * /support#delete-account is the account-deletion page given to Google
 * Play: keep that section's id. What it says about deleting an account
 * follows what the API does (moa_backend, users.service.delete_user);
 * everything else follows the Terms and the Privacy Policy, and promises
 * nothing they don't.
 */
import { SUPPORT_EMAIL } from "./legal";

const mail = `[${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL})`;

export const SUPPORT = {
  key: "support",
  path: "/support",
  title: "Support",
  description:
    "Get help with MyOtherApp: how to reach us, finding your ticket, events that review registrations, payments and refunds, reporting a problem, and how to delete your account.",
  lede: "Need a hand with MyOtherApp? Here's how to reach us, answers to the questions we get most, and how to delete your account.",
  sections: [
    {
      id: "contact",
      heading: "Contact us",
      blocks: [
        ["p", `Email us at ${mail}. In the app, **Settings → Contact Support** opens an email to us.`],
        [
          "p",
          "Tell us what happened, and add the event's name or link, or a screenshot, if you have one. If it's about your account, write from the email address on it so we can find it.",
        ],
        ["p", "We read every message and reply as soon as we can. If you're reporting a post or a person, we review it and act within 24 hours."],
      ],
    },
    {
      id: "questions",
      heading: "Common questions",
      questions: [
        {
          id: "register",
          q: "How do I register for an event?",
          blocks: [
            [
              "p",
              "Open the event in the app or on [our website](/events) and tap **Register**. Fill in the short form, and pay at checkout if the event has a fee. On the website you can register without an account, with just your name, email address and phone number.",
            ],
          ],
        },
        {
          id: "tickets",
          q: "Where's my ticket?",
          blocks: [
            [
              "p",
              "We email your ticket to you as soon as you're registered. It's also in the app, under **Events → Registered**, and on the website in [My tickets](/me/tickets) when you're signed in. Show its QR code at the door.",
            ],
            [
              "p",
              "Registered on the website without an account? Sign in to the app with the same email address, and your tickets move into your account. Can't find the email? Check your spam folder, or write to us.",
            ],
          ],
        },
        {
          id: "reviewed-registrations",
          q: "The event says the club reviews registrations. What happens?",
          blocks: [
            [
              "p",
              "You register as usual, and the club reviews your registration. We email you a link where you can see where it stands, or cancel it. If yours is confirmed, your ticket comes by email. For a paid ticket, you get a link to pay instead: nothing is charged until then.",
            ],
          ],
        },
        {
          id: "payments-and-refunds",
          q: "How do payments and refunds work?",
          blocks: [
            [
              "p",
              "You pay through Razorpay, by UPI, card, netbanking or wallet. Depending on the event, the money goes to MyOtherApp's Razorpay account or straight to the club's own. The total you see at checkout is what you pay.",
            ],
            [
              "p",
              "Refunds are up to the club running the event. If you cancel or can't make it, there's no refund unless the club offers one. If the club cancels the event, it's responsible for refunding you. Ask the club first; if you can't reach them, write to us and we'll help where we can. The full rules are in our [Terms](/terms#payments-and-refunds).",
            ],
            ["p", "If money left your account but you didn't get a ticket, write to us before you pay again."],
          ],
        },
        {
          id: "clubs",
          q: "I run a club. Where do I start?",
          blocks: [
            [
              "p",
              "See [MyOtherApp for clubs](/for-clubs) for what your club gets, and [Pricing](/pricing) for the plans. Questions about your club's plan or billing can come to us at the same address.",
            ],
          ],
        },
        {
          id: "report",
          q: "How do I report a post or a person?",
          blocks: [
            [
              "p",
              "In the app, open the **⋯** menu on a post or a comment and choose **Report post** or **Report comment**. To stop seeing someone's comments, open the **⋯** menu on one of them and choose **Block**. They won't be told, and you can unblock them under **Settings → Blocked Users**.",
            ],
            [
              "p",
              `For anything else, email ${mail} with a link or a screenshot, and tell us why. We review reports and act within 24 hours. The rules are in our [Terms](/terms#acceptable-use).`,
            ],
          ],
        },
      ],
    },
    {
      id: "delete-account",
      heading: "Delete your account",
      blocks: [
        ["p", "You can delete your MyOtherApp account at any time, in the app or by email."],
        ["h3", "In the app"],
        [
          "ol",
          [
            "Open the **Profile** tab and tap **Settings**.",
            "Scroll to the bottom and tap **Delete Account**.",
            "Tap **DELETE** to confirm. Your account is deleted straight away, and you're signed out.",
          ],
        ],
        ["h3", "By email"],
        [
          "p",
          `Email ${mail} from the email address on your account, with the subject "Delete my account". We may ask you to confirm it's you, and we'll reply when it's done. If you registered for events on our website without an account, you can ask us to delete those details the same way.`,
        ],
        ["h3", "What is deleted"],
        [
          "ul",
          [
            "Your name, email address, phone number, username and password are erased from your account, and no one can sign in to it again.",
            "Your profile (with your WhatsApp number), your interests and the clubs you follow are removed.",
            "Your event registrations are removed. Your tickets stop working, including tickets for events that haven't happened yet, and organisers no longer see you in their lists on MyOtherApp.",
            "You're signed out on every device, and your phone stops getting notifications from us. If you signed in with Apple, we also revoke MyOtherApp's access to your Apple ID.",
          ],
        ],
        ["h3", "What is kept"],
        [
          "ul",
          [
            "**Payment records:** we keep records of your payments and refunds, as the law requires for accounting and tax.",
            '**Your comments:** they stay under the posts you commented on, but without your name; they show as "A follower". Your likes and poll votes still count. To remove your comments, use **Delete comment** on each one before you delete your account.',
            "**Past registrations:** they're hidden everywhere on MyOtherApp, but the records, with the details you registered with, aren't erased straight away. If you want them erased too, email us and say so. We'll erase whatever the law doesn't require us to keep.",
            "**Reports and moderation records:** we keep these so we can deal with repeated abuse.",
            "**What organisers already have:** registration lists a club has downloaded, and contact books it kept after past events, are the club's own. Ask the club to delete them.",
          ],
        ],
        ["h3", "How long it takes"],
        [
          "p",
          "In the app, as soon as you confirm. By email, once we've checked the request came from you; we'll reply to tell you it's done. Deleting an account can't be undone. You can sign up again with the same email address, but nothing from the old account comes back.",
        ],
        [
          "p",
          "Deleting your account doesn't refund anything you've paid. If you've paid for an event that hasn't happened yet, ask the organiser about a refund before you delete your account.",
        ],
        ["p", "There's more about what happens to your data in our [Privacy Policy](/privacy#delete-account)."],
      ],
    },
  ],
};
