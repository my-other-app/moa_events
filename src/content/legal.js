/**
 * The Privacy Policy and the Terms and Conditions, as the MyOtherApp app
 * shows them (lib/features/profile/presentation/pages/settings/), set out
 * as headings, paragraphs and lists. These are legal texts: the wording is
 * the app's, word for word, except the brand is written MyOtherApp
 * throughout. Plain data, no JSX, so the link-preview function can serve
 * the same words to crawlers.
 *
 * A block is ["p", text], ["h3", text], ["ul", [text…]] or ["ol", [text…]].
 * Inside a text, **…** is bold and [label](href) is a link.
 */

export const SUPPORT_EMAIL = "support@myotherapp.in";
const mail = `[${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL})`;

export const PRIVACY = {
  key: "privacy",
  path: "/privacy",
  title: "Privacy Policy",
  updated: "2025-05-20",
  description: "How MyOtherApp collects, uses, shares and protects your data, and the controls you have over it.",
  intro: [["p", "Welcome to MyOtherApp! We care about your privacy, so here's the lowdown on how we handle your data."]],
  sections: [
    {
      id: "what-we-collect",
      heading: "1. What We Collect",
      blocks: [
        ["p", "When you use MyOtherApp, we may collect:"],
        [
          "ul",
          [
            "**Basic Info:** Your name, email, college ID, and profile photo.",
            "**Event Interactions:** Events you register for, points you earn, and clubs you follow.",
            "**Device Info:** Stuff like your device type, OS, and app usage stats (used to improve your experience).",
            "**Location (Optional):** If enabled, we may use your location to suggest nearby events.",
          ],
        ],
      ],
    },
    {
      id: "why-we-collect-it",
      heading: "2. Why We Collect It",
      blocks: [
        [
          "ul",
          [
            "To create and manage your account",
            "To show you personalized events and feeds",
            "To let you earn and redeem points",
            "To send you notifications about events you're into",
            "To help clubs manage event participation and logistics",
            "To make the app better based on what's working (and what's not)",
          ],
        ],
      ],
    },
    {
      id: "who-we-share-it-with",
      heading: "3. Who We Share It With",
      blocks: [
        ["p", "We don't sell your data, ever. We only share it with:"],
        [
          "ul",
          [
            "**Event Organizers:** Limited details like your name and email for registration and communication.",
            "**Analytics Providers:** Anonymized usage data to help improve app performance.",
            "**Legal Authorities:** Only if we're legally required to.",
          ],
        ],
      ],
    },
    {
      id: "your-controls",
      heading: "4. Your Controls",
      blocks: [
        ["p", "You've got power. You can:"],
        ["ul", ["Edit or delete your profile anytime", "Turn off push notifications", `Request deletion of your account and data by emailing ${mail}`]],
      ],
    },
    {
      id: "data-storage-and-security",
      heading: "5. Data Storage & Security",
      blocks: [
        [
          "p",
          "We store your info securely using trusted cloud services. We use encryption and best practices to protect your data, but no system is 100% hack-proof. So stay safe out there.",
        ],
      ],
    },
    {
      id: "cookies-and-tracking",
      heading: "6. Cookies & Tracking",
      blocks: [
        [
          "p",
          "We don't use cookies (because it's a mobile app), but we do use app analytics tools like Firebase or Mixpanel to see what features you love most.",
        ],
      ],
    },
    {
      id: "changes-to-this-policy",
      heading: "7. Changes to This Policy",
      blocks: [["p", "If we change anything major, we'll let you know via the app or email. You can always see the latest version here."]],
    },
    {
      id: "contact-us",
      heading: "8. Contact Us",
      blocks: [
        ["p", "Got questions? Privacy concerns? Meme ideas? Hit us up:"],
        ["p", `**Email:** ${mail}`],
      ],
    },
  ],
};

export const TERMS = {
  key: "terms",
  path: "/terms",
  title: "Terms and Conditions",
  // The app's text carries no date of its own; it has not changed since it shipped in the 20 May 2025 release.
  updated: "2025-05-20",
  description: "The terms for using MyOtherApp: your responsibilities, payments and refunds, reviews, and the limits of our liability.",
  intro: [
    [
      "p",
      'Welcome to MyOtherApp! These Terms and Conditions ("Terms") govern your access to and use of our mobile application (the "App"). By downloading, installing, or using MyOtherApp, you agree to be bound by these Terms. If you do not agree with any part of these Terms, please do not use the App.',
    ],
  ],
  sections: [
    {
      id: "ownership",
      heading: "Ownership",
      blocks: [
        [
          "p",
          'MyOtherApp is developed and managed by Edwin Emmanuel Roy and Muhammed R ("we," "us," or "our"). While we are not a registered company, we strive to provide a reliable and user-friendly experience through this App.',
        ],
      ],
    },
    {
      id: "eligibility",
      heading: "Eligibility",
      blocks: [
        [
          "p",
          "There are no specific eligibility requirements to use MyOtherApp. The app is open to all users who wish to access its features. However, by using this app, you confirm that you will comply with these Terms and applicable laws while using the app.",
        ],
      ],
    },
    {
      id: "user-responsibilities",
      heading: "User Responsibilities",
      blocks: [
        ["p", "By using MyOtherApp, you agree to:"],
        [
          "ol",
          [
            "**Provide Accurate Information:** All users must provide true, complete, and up-to-date information during registration and while using the app. Any false or misleading details may result in disqualification from events, revocation of issued certificates, or suspension from the platform.",
            "**Identity Verification for Events:** To participate in registered events, users must complete a verification process using a valid government-issued ID. Failure to provide proper verification may result in denial of entry.",
            "**Account Security:** Users are responsible for maintaining the confidentiality of their login credentials. Any unauthorized access or suspicious activity should be reported immediately.",
            "**Compliance with Laws:** Users must not engage in fraudulent activities, violate laws, or attempt to misuse the platform in any manner.",
          ],
        ],
        ["p", "We reserve the right to suspend or terminate accounts that violate these responsibilities."],
      ],
    },
    {
      id: "privacy",
      heading: "Privacy",
      blocks: [["p", "Your privacy is important to us. Please read our [Privacy Policy](/privacy) to understand how we collect, use, and protect your information."]],
    },
    {
      id: "payments-and-refunds",
      heading: "Payments & Refunds",
      blocks: [
        ["h3", "Event Registration Fees"],
        ["p", "MyOtherApp serves as a platform that facilitates event registrations. Event fees are determined by the event organizers and displayed at the time of checkout."],
        ["p", "In addition to the event fee, the total amount payable includes:"],
        [
          "ul",
          [
            "**Platform Fee** – A service fee charged by MyOtherApp, which varies between events.",
            "**Gateway Fee** – A fixed 2% processing fee applied to all transactions.",
          ],
        ],
        ["h3", "Refund Policy"],
        [
          "ul",
          [
            "**No Refunds for User-Initiated Cancellations** – Once an event registration is completed, no refunds will be provided if a participant cancels or fails to attend the event.",
            "**Refunds for Event Cancellations** – If an event is cancelled by the event organizer, conducting club, or community, the responsibility of issuing refunds lies with the organizing committee. MyOtherApp does not process refunds directly but facilitates the refund process initiated by the event organizers.",
          ],
        ],
        ["h3", "Payment Transparency"],
        ["p", "The total amount payable, including all applicable charges, will be clearly displayed during checkout before confirming the payment."],
        ["p", "By proceeding with payment, users acknowledge and agree to these terms."],
      ],
    },
    {
      id: "reviews-and-feedback",
      heading: "Reviews & Feedback",
      blocks: [
        ["h3", "Posting Reviews"],
        ["p", "Users can submit reviews and ratings only if they have attended an event."],
        ["p", "Reviews will be visible only to the event host and will not be publicly displayed."],
        ["h3", "Content Guidelines"],
        ["p", "Reviews must be respectful and constructive. Any review containing abusive language, hate speech, or inappropriate content will be deleted."],
        ["p", "However, the rating provided with the review will still be considered."],
        ["h3", "Moderation & Rights"],
        ["p", "MyOtherApp reserves the right to remove or moderate reviews that violate content guidelines."],
        ["p", "Users are encouraged to provide honest feedback to help event hosts improve future events."],
      ],
    },
    {
      id: "limitations-of-liability",
      heading: "Limitations of Liability",
      blocks: [
        ["h3", "Use of the App at Your Own Risk"],
        [
          "p",
          'MyOtherApp is provided on an "as-is" and "as-available" basis. While we strive to ensure a seamless user experience, we do not guarantee that the app will always be available, error-free, or uninterrupted.',
        ],
        ["p", "Users acknowledge that they use the app at their own risk, and we shall not be liable for any technical issues, data loss, or service interruptions that may occur."],
        ["h3", "No Liability for Third-Party Actions"],
        [
          "p",
          "MyOtherApp acts as a platform that facilitates event registrations but does not organize or control the events listed by communities which are not under the direct control of MyOtherApp.",
        ],
        ["p", "We are not responsible for the actions, decisions, or policies of event hosts, organizers, or third-party service providers (such as payment gateways)."],
        ["p", "Any disputes related to event content, execution, or refunds must be addressed directly with the event organizers."],
        ["h3", "No Responsibility for Financial Transactions"],
        ["p", "Payments made through MyOtherApp involve platform fees and gateway fees, which are clearly displayed at checkout."],
        ["p", "We do not store or process financial transactions directly; payments are handled through secure third-party payment processors."],
        ["p", "We are not responsible for any unauthorized transactions, failed payments, or refund disputes."],
        ["h3", "No Liability for User Misconduct"],
        ["p", "We do not actively monitor user activity but reserve the right to remove content, suspend accounts, or take necessary action if users violate our terms."],
        ["p", "Any consequences resulting from false information, misuse of the platform, or policy violations are solely the responsibility of the user."],
        ["h3", "Limitations on Damages"],
        ["p", "To the fullest extent permitted by law, MyOtherApp, its creators (Edwin Emmanuel Roy and Muhammed R), and any affiliated parties shall not be liable for:"],
        [
          "ul",
          [
            "Any indirect, incidental, special, or consequential damages, including loss of profits, data, goodwill, or reputation.",
            "Any damage caused due to service disruptions, technical failures, or cyber threats beyond our control.",
            "Any claims exceeding the total amount paid by a user for services within the last three (3) months (if applicable).",
          ],
        ],
        ["h3", "Indemnification"],
        ["p", "By using MyOtherApp, you agree to indemnify and hold harmless the platform, its creators, employees, and affiliates from any claims, damages, or legal disputes arising from:"],
        ["ul", ["Your violation of these Terms.", "Your participation in events or transactions through the app.", "Any third-party claims related to your use of the platform."]],
        ["h3", "Exclusions and Jurisdiction"],
        ["p", "Some jurisdictions may not allow certain liability exclusions or limitations, so parts of this section may not apply to all users."],
        ["p", "In such cases, our liability will be limited to the maximum extent permitted by applicable laws."],
      ],
    },
  ],
};

export const LEGAL = { privacy: PRIVACY, terms: TERMS };

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** A text's pieces: {text}, {strong} or {link, href}, in order. */
export function inline(text) {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(INLINE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { strong: m[1] } : { link: m[2], href: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** The words alone, markup taken out (for descriptions and tests). */
export const plainText = (text) => inline(text).map((p) => p.text ?? p.strong ?? p.link).join("");

const longDate = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

/** "20 May 2025". */
export const updatedLabel = (day) => longDate.format(new Date(`${day}T00:00:00Z`));
