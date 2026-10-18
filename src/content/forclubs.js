/**
 * What the For clubs and Pricing pages say, as plain data the link-preview
 * function can serve too. Only what the clubs dashboard does today, in its
 * own words: no customers, no quotes, no numbers beyond the live ones the
 * API reports. Prices are never written here; they come from GET /plans,
 * and so does which plan has what — nothing here ties a feature to a plan.
 *
 * Text may carry **bold** and [links](/path), as in content/legal.js.
 */

export const FOR_CLUBS = {
  path: "/for-clubs",
  title: "MyOtherApp for clubs · Run your club's events from one place",
  description:
    "Registrations with your own questions, paid tickets through Razorpay, QR check-in, certificates, a live room and a website for your club: everything a student club needs to run its events, in one dashboard. Start free.",
  lede: "Sign-ups with your own questions, paid tickets, QR check-in at the door, certificates and a live room for the audience — one dashboard for every event your club runs, from the first sign-up to the last certificate.",
  /** The short list under the hero: one word or two for each thing the dashboard does. */
  highlights: [
    "Custom questions",
    "Razorpay payments",
    "QR check-in",
    "Kiosks",
    "ID cards",
    "Certificate designer",
    "Live quiz & polls",
    "Q&A",
    "Competitions",
    "Club website",
    "Tracking links",
    "Emails",
    "Threads",
    "Team roles",
    "Merch & swag",
    "Closeout reports",
  ],
  phases: [
    {
      id: "before",
      when: "Before the event",
      title: "Fill the room",
      lede: "Put the event up, ask what you need to know, and get it in front of the right people.",
      art: "before",
      features: [
        {
          icon: "layout",
          title: "Events and registration",
          text: "Set up an event step by step — when, where, places and price, speakers, rules — with a sign-up form that asks exactly what you need.",
          points: [
            "Your own questions: text, number, email, phone, link, date and time, one choice or several",
            "Sign-up closes by itself when the places are taken",
            "Import a guest list from a spreadsheet",
          ],
        },
        {
          icon: "creditCard",
          title: "Paid tickets through Razorpay",
          text: "Set a fee and people pay through Razorpay as they register. Their ticket is issued once the payment goes through.",
          points: ["Merch bought with the ticket, paid in one go", "Paid and unpaid at a glance on your attendee list"],
        },
        {
          icon: "link",
          title: "Tracking links and analytics",
          text: "A short link for every poster, story and group chat, with a QR code to print — then see which one brought people in.",
          points: ["Opens, follows and registrations for each link", "Views, sign-ups, turnout and repeat attendees on your dashboard"],
        },
        {
          icon: "mail",
          title: "Emails and announcements",
          text: "Emails for every stage — the invite with the ticket, the reminder, the thank-you — built in a block editor and sent by hand or on a timer.",
          points: ["Push announcements to everyone registered", "A delivery log that shows what arrived, with resend"],
        },
      ],
    },
    {
      id: "day",
      when: "On the day",
      title: "Run the door",
      lede: "A scanner on every volunteer's phone, a kiosk at the entrance and a live room that keeps the audience with you.",
      art: "day",
      dark: true,
      features: [
        {
          icon: "qr",
          title: "QR tickets and check-in",
          text: "Every guest gets a QR ticket. Each door has its own scanner link: volunteers open it on their phones and scan people in as they arrive.",
          points: ["Walk-ups registered at the door", "Keeps scanning when the Wi-Fi drops, and syncs later", "Who's in, who let them in, and the pace of arrivals"],
        },
        {
          icon: "monitor",
          title: "Kiosks and ID cards",
          text: "Turn a tablet into a self check-in kiosk, and print ID cards or name badges as people arrive — or in a batch beforehand.",
          points: ["Guests can check in from their own phones too", "CR80, badge, A6, lanyard and label-roll sizes"],
        },
        {
          icon: "zap",
          title: "Live room and competitions",
          text: "Quizzes, polls, Q&A and live updates from one place, with a projector screen for the room. Running a hackathon? Tracks, teams, submissions, judges, rounds and a leaderboard.",
          points: ["Multiple-choice, word-cloud and rating polls", "Approve questions before they show", "A feedback survey that sends itself after the event"],
        },
        {
          icon: "bag",
          title: "Store, merch and swag",
          text: "Sell T-shirts and more with the ticket, with sizes and stock, collected at the door. Hand out free swag by rule, and log every hand-over.",
          points: ["Swag for everyone who checks in, the first arrivals, speakers or winners"],
        },
      ],
    },
    {
      id: "after",
      when: "After the event",
      title: "Wrap it up",
      lede: "Certificates out, numbers in, and a report worth sharing.",
      art: "after",
      features: [
        {
          icon: "award",
          title: "Certificates, designed by you",
          text: "Upload your own template or start from a layout, then place names, answers and a QR code that proves each certificate is real. Issue them to everyone who checked in, or to the roles you choose, and email them out.",
          points: ["The same designer makes tickets, ID cards and programmes", "Every certificate is numbered, and can be revoked or reissued"],
        },
        {
          icon: "fileText",
          title: "Closeout reports",
          text: "A checklist to close the event, then a PDF report: registered, checked in, turnout, no-shows, walk-ins, certificates issued and the average rating — emailed to whoever needs it.",
          points: ["Keep the guest data, or scrub it once the event is done"],
        },
      ],
    },
    {
      id: "year",
      when: "All year round",
      title: "Grow your club",
      lede: "Between events, keep your people close and your team organised.",
      art: "year",
      features: [
        {
          icon: "globe",
          title: "A website for your club",
          text: "A public site built from your club and its events, at yourclub.myotherapp.in. Four templates, light or dark, five fonts — and your new events show up on it as you add them.",
          points: ["Visits, sign-ups and where your visitors came from"],
        },
        {
          icon: "comment",
          title: "Threads and followers",
          text: "Post updates and polls for the people who follow your club, on your club page and in their app feed. See who follows you, by college and by interest.",
          points: ["Export your followers to a spreadsheet"],
        },
        {
          icon: "users",
          title: "Team access with roles",
          text: "Invite your committee by email and give each person a role — Admin, Editor or Door — so everyone gets what their job needs and nothing more.",
          points: ["Editors run events without seeing the money", "Two-factor sign-in and new-device alerts"],
        },
        {
          icon: "barChart",
          title: "Finance",
          text: "Every rupee in and out — tickets, merch, refunds, sponsorships and your own spending — for each event and for the whole club, with what's left over.",
          points: ["Download a statement for the treasurer"],
        },
      ],
    },
  ],
  steps: [
    { title: "Apply", text: "Sign up with your club's details and pick a plan. The Free plan is a fine place to start." },
    { title: "We verify your club", text: "We check that your club is who it says it is before it goes public, so students can trust every event they find here." },
    { title: "Go live", text: "Publish your first event, share its link, and watch the registrations come in." },
  ],
};

export const PRICING_PAGE = {
  path: "/pricing",
  title: "Pricing · MyOtherApp for clubs",
  description:
    "Plans for student clubs, starting free: events, registrations, paid tickets, QR check-in, certificates and more. Pay monthly, or yearly for less.",
};

/**
 * The questions organisers ask, answered. The yearly answer uses the
 * months-free number when the plans say it.
 */
export function clubFaq({ yearlyMonthsFree = null, contactEmail = "support@myotherapp.in" } = {}) {
  const months = yearlyMonthsFree > 0 ? yearlyMonthsFree : null;
  return [
    {
      id: "payments",
      q: "How do payments and payouts work?",
      a: [
        "When an event has a fee, people pay through Razorpay as they register, and their ticket is issued once the payment goes through.",
        "You set the ticket price, and attendees pay exactly that. Finance shows every payment and refund beside your own expenses.",
        "Connect your own Razorpay account under Payments in the dashboard and ticket money goes straight to your club. Until you do, payments go through MyOtherApp's account.",
        `For how money collected through MyOtherApp's account reaches your club, [write to us](mailto:${contactEmail}) and we'll walk you through it.`,
      ],
    },
    {
      id: "free",
      q: "Is the Free plan really free?",
      a: ["Yes — ₹0 a month, for as long as it suits your club. It comes with the limits shown in the plans; move up when you outgrow them."],
    },
    {
      id: "switch",
      q: "Can we switch plans later?",
      a: ["Yes. Move up when your events grow, or down when things are quieter, from your club's dashboard."],
    },
    {
      id: "yearly",
      q: "How much do we save by paying yearly?",
      a: [
        months
          ? `Paying yearly gets you ${months} ${months === 1 ? "month" : "months"} free: twelve months for the price of ${12 - months}. Flip the switch above the plans to see each yearly price.`
          : "Paying yearly costs less than paying month by month. Flip the switch above the plans to compare.",
      ],
    },
    {
      id: "cancel",
      q: "Can we cancel?",
      a: ["Yes, whenever you like, from your club's dashboard. You won't be billed for another period."],
    },
    {
      id: "students",
      q: "Do our attendees need the app?",
      a: [
        "No. People find your event, register and get their ticket by email right here on the website. The app keeps their tickets and the clubs they follow in one place, if they want it.",
      ],
    },
    {
      id: "data",
      q: "What happens to our data, and our attendees'?",
      a: [
        "We don't sell anyone's data, ever. Your team's access is set by role, and after each event you choose whether to keep your guests' details or scrub them.",
        "Our [Privacy Policy](/privacy) has the details.",
      ],
    },
    {
      id: "institution",
      q: "We're a whole college or university. Is there a plan for us?",
      a: [`Yes. Pick the plan that fits, or [write to us](mailto:${contactEmail}) and we'll work out one for your institution together.`],
    },
  ];
}
