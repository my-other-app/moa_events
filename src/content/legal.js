/**
 * The Privacy Policy and the Terms and Conditions for MyOtherApp (the app,
 * this website, the clubs dashboard and the club websites), set out as
 * headings, paragraphs and lists. The app's Settings opens these pages
 * (/privacy and /terms) rather than carrying text of its own. Plain data,
 * no JSX, so the link-preview function can serve the same words to
 * crawlers.
 *
 * A block is ["p", text], ["h3", text], ["ul", [text…]] or ["ol", [text…]].
 * Inside a text, **…** is bold and [label](href) is a link.
 *
 * /privacy#delete-account is the account-deletion page given to Google
 * Play: keep that section's id.
 */

export const SUPPORT_EMAIL = "support@myotherapp.in";
const mail = `[${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL})`;

export const PRIVACY = {
  key: "privacy",
  path: "/privacy",
  title: "Privacy Policy",
  updated: "2026-10-18",
  description:
    "How MyOtherApp collects, uses, shares and protects your data, how long we keep it, how to delete your account, and the controls you have over it.",
  intro: [
    [
      "p",
      "Welcome to MyOtherApp! We care about your privacy. This policy explains what we collect when you use MyOtherApp (the app for iOS and Android, our website at myotherapp.in, the clubs dashboard at clubs-next.myotherapp.in, and the club websites we host), why we collect it, who sees it, how long we keep it, and the controls you have.",
    ],
    ["p", 'In this policy, "we", "us" and "our" mean MyOtherApp and the people who run it, named in our [Terms](/terms).'],
  ],
  sections: [
    {
      id: "what-we-collect",
      heading: "1. What We Collect",
      blocks: [
        ["p", "When you use MyOtherApp, we may collect:"],
        [
          "ul",
          [
            "**Account details:** your name, email address and username. If you sign up with an email address, we also keep your password, stored only as a hash. If you sign in with Google or Apple, we receive the name and email address they share with us.",
            "**Profile:** the organisation or college and the WhatsApp number you add, the avatar or photo you choose, your interests, and the clubs you follow.",
            "**Event registrations:** your name, email address and phone number; your answers to the organiser's questions, including any files you upload; your ticket; whether and when you were checked in; certificates issued to you; and, if you arrived through a club's tracking link, which link it was.",
            "**Payments:** what you paid for, the amount, its status and Razorpay's reference numbers. You enter your card, UPI or bank details on Razorpay's checkout, and we never receive your full card number or CVV. We do keep the payment details Razorpay sends us, which can include your UPI ID, the bank or wallet you used, the last digits of your card, and the email address and phone number given at checkout.",
            "**What you post:** your comments, likes and poll votes on club threads; your questions and answers in an event's live room; and the ratings, reviews and feedback you give organisers.",
            "**Reports and blocks:** reports you make (what you reported, the reason and any note you add), reports other people make about your content, and the people you block.",
            "**Device and app data:** the push-notification token Firebase gives your device, and whether it runs iOS or Android; crash reports from Firebase Crashlytics, such as the device model, operating system, app version and what went wrong; and usage data from Firebase Analytics, such as which screens you open. On Android, Firebase Analytics can also read your device's advertising ID. We don't show ads.",
            "**Sign-in and security records:** each time you sign in or try to, the time, the method, the IP address and the browser or device used, and the approximate place (city and region) worked out from that IP address. We also keep the IP address and browser of each signed-in session.",
            '**Location:** the app doesn\'t ask for your location. On the website, we estimate your area from your IP address to show events near you. If you choose "Use my location", your browser asks for your permission and then shares a point rounded to about 100 metres. The website keeps that point in your browser and sends it with requests for nearby events; we don\'t save it to your account.',
            "**Website visits:** when you open an event page, we record the visit with your IP address, your browser and, if you're signed in, your account. Visits through a club's tracking link, and visits to a club's website, are counted using a one-way hash of your IP address and browser, along with the page you came from. In those cases we don't keep the IP address itself.",
            "**Messages to us:** what you send us by email, such as reports and requests.",
            "**If you run a club:** your club's details; the names and email addresses of your team members; your plan and billing history; and, if you connect your club's own Razorpay account, its API keys, which we store encrypted.",
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
            "To create and manage your account, and to sign you in securely",
            "To register you for events, issue your ticket and check you in, and to send you event emails, reminders and certificates",
            "To process payments and refunds, and to keep financial records",
            "To show you events, clubs and posts that are relevant to you, including events near you",
            "To send you notifications about events and clubs you follow",
            "To help clubs manage their events, registrations and payments, and see which of their links brought people in",
            "To keep MyOtherApp safe: reviewing reports, enforcing our Terms, and preventing fraud, abuse and unauthorised access to accounts",
            "To find and fix problems, and to make the app and website better based on what's working (and what's not)",
            "To meet our legal obligations",
          ],
        ],
      ],
    },
    {
      id: "who-we-share-it-with",
      heading: "3. Who We Share It With",
      blocks: [
        ["p", "We don't sell your data, ever. We share it only as described here."],
        ["h3", "The organiser of an event"],
        [
          "p",
          "When you register for an event, the club or organisation running it sees your registration: your name, email address and phone number, your answers to its questions, your ticket and payment status, whether you checked in, and which of its links brought you. Clubs can download their registration lists. After an event, a club can keep your name, email address, phone number and attendance in its contact book. A club also sees who follows it, with each follower's name, username and organisation.",
        ],
        ["p", "Once a club has your details, how it uses them is its responsibility."],
        ["h3", "Other people on MyOtherApp"],
        [
          "p",
          "Your comments on club threads are public and show your name. Anyone can read them in the app and on our website, signed in or not. We don't tell anyone that you reported them or their content, and we don't tell people you block.",
        ],
        ["h3", "Service providers who work for us"],
        [
          "ul",
          [
            "**Razorpay** processes payments. If a club has connected its own Razorpay account, your payment for that club's events goes to its account. The club and Razorpay then handle that payment under their own terms.",
            "**Google Firebase** provides push notifications (Cloud Messaging), app usage analytics (Analytics) and crash reports (Crashlytics).",
            "**Amazon Web Services** hosts our servers and database, stores files such as photos and uploads (Amazon S3), and sends email (Amazon SES).",
            "**Resend** may also send our emails.",
            "**Vercel** and **Cloudflare** host and deliver our website, the clubs dashboard and club websites.",
            "**Google** and **Apple** sign you in, if you choose to sign in with them.",
            "**ipapi.co** turns an IP address into an approximate place.",
            "**Google Maps** shows an event's venue on its event page and gives directions. Loading the map shares your IP address and browser details with Google.",
            "**WhatsApp (Meta)** delivers an organiser's event messages, if the organiser sends them by WhatsApp.",
            "**Discord** is where our team receives alerts about errors and reported content.",
          ],
        ],
        ["p", "We share with these providers what they need to do their part, and nothing more."],
        ["h3", "When the law requires it"],
        [
          "p",
          "We share information with the police, courts or other authorities when the law requires it. We may also share it when we need to, to protect someone's safety or to protect our users or MyOtherApp from fraud or abuse.",
        ],
      ],
    },
    {
      id: "how-long-we-keep-it",
      heading: "4. How Long We Keep It",
      blocks: [
        ["p", "How long we keep your data depends on what it is:"],
        [
          "ul",
          [
            "**Your account and profile:** for as long as your account is open. For what happens when you delete it, see [Deleting your account](/privacy#delete-account).",
            "**Event registrations:** for as long as your account is open, so that your tickets and certificates keep working. Each organiser decides what happens to its guest list after an event. By default the list is kept. An organiser can instead have us erase phone numbers and answers to its questions a set time after the event; the registration itself is still kept. If the organiser keeps a contact book, it keeps your name, email address, phone number and attendance from that event.",
            "**Payment records:** for as long as we need them for accounting, tax and resolving disputes, even after you delete your account.",
            "**Reports and moderation decisions:** for as long as we need them to deal with repeated abuse.",
            "**Sign-in and security records:** for as long as we need them to protect accounts and look into misuse.",
            "**Crash reports and usage analytics:** for the periods set in our Firebase project.",
          ],
        ],
      ],
    },
    {
      id: "your-controls",
      heading: "5. Your Controls",
      blocks: [
        ["p", "You've got power. You can:"],
        [
          "ul",
          [
            "Edit your profile at any time",
            "Turn off push notifications in your phone's settings",
            "Block people whose comments you don't want to see, and unblock them under Settings → Blocked Users",
            'Stop sharing your browser\'s location with the website, with "Forget my location" or in your browser\'s settings',
            `Ask for a copy of your data, or for something to be corrected, by emailing ${mail}`,
            "Delete your account, in the app or by email (see below)",
          ],
        ],
      ],
    },
    {
      id: "delete-account",
      heading: "6. Deleting Your Account",
      blocks: [
        ["p", "You can delete your MyOtherApp account at any time, in the app or by email."],
        ["h3", "In the app"],
        [
          "ol",
          [
            "Open the **Profile** tab and tap **Settings**.",
            "Scroll to the bottom and tap **Delete Account**.",
            "Tap **DELETE** to confirm. You're signed out straight away.",
          ],
        ],
        ["h3", "By email"],
        [
          "p",
          `Email ${mail} from the email address on your account, with the subject "Delete my account". We may ask you to confirm the request before we act on it, and we'll reply when it's done. If you registered for events on our website without an account, you can ask us to delete those details in the same way.`,
        ],
        ["h3", "What is deleted"],
        [
          "ul",
          [
            "Your account is closed, and no one can sign in to it.",
            "Your profile, your interests and the clubs you follow are removed.",
            "Your event registrations are removed. Your tickets stop working, including tickets for events that haven't happened yet, and organisers no longer see you in their lists on MyOtherApp.",
          ],
        ],
        ["h3", "What is kept"],
        [
          "ul",
          [
            "These records are marked as deleted and hidden everywhere on MyOtherApp, but they are not erased straight away. If you want your personal data erased, not just your account closed, say so when you email us. We'll erase whatever the law doesn't require us to keep.",
            "**Payment records:** we keep records of your payments and refunds, as the law requires for accounting and tax.",
            '**Your comments:** they stay under the posts you commented on, but without your name; they show as "A follower". Your likes and poll votes still count. If you want your comments gone, use **Delete comment** on each one before you delete your account.',
            "**Reports and moderation records:** we keep these so we can deal with repeated abuse.",
            "**What organisers already have:** registration lists a club has downloaded, and contact books it kept after past events, are the club's own. Ask the club to delete them.",
          ],
        ],
        [
          "p",
          "Deleting your account doesn't refund anything you've paid. If you've paid for an event that hasn't happened yet, ask the organiser about a refund before you delete your account.",
        ],
      ],
    },
    {
      id: "data-storage-and-security",
      heading: "7. Data Storage & Security",
      blocks: [
        [
          "p",
          "We store your data with the trusted providers listed above. Connections to our servers are encrypted, passwords are stored only as hashes, and the Razorpay keys clubs give us are stored encrypted. No system is 100% hack-proof, so we can't guarantee that your data will never be accessed without permission. Stay safe out there, and keep your password to yourself.",
        ],
      ],
    },
    {
      id: "cookies-and-tracking",
      heading: "8. Cookies & Tracking",
      blocks: [
        [
          "ul",
          [
            "**In the app:** we use Firebase Analytics and Crashlytics, as described above. We don't use them for advertising, and we don't track you across other companies' apps or websites.",
            "**On our websites:** we don't use advertising or analytics cookies. The website keeps a few things in your browser's storage so that it works: your sign-in, the location you chose, a registration you haven't finished, your place in an event's live room, and, until you close the tab, the tracking link you arrived by. Signing in can also set cookies that keep you signed in.",
            "**Other companies' content:** Google Maps on event pages, Google sign-in and Razorpay's checkout load from Google and Razorpay, which may set their own cookies under their own privacy policies.",
          ],
        ],
      ],
    },
    {
      id: "children",
      heading: "9. Children",
      blocks: [
        [
          "p",
          `MyOtherApp is made for students and the clubs and organisations they belong to. It is not directed at children, and we don't knowingly collect personal data from children. If you believe a child has given us personal data, email ${mail} and we'll delete it.`,
        ],
      ],
    },
    {
      id: "changes-to-this-policy",
      heading: "10. Changes to This Policy",
      blocks: [
        [
          "p",
          "If we change anything major, we'll let you know via the app or email. You can always see the latest version here, and the date at the top shows when it last changed.",
        ],
      ],
    },
    {
      id: "contact-us",
      heading: "11. Contact Us",
      blocks: [
        ["p", "Got questions, a privacy concern, or a request about your data? Write to us:"],
        ["p", `**Email:** ${mail}`],
      ],
    },
  ],
};

export const TERMS = {
  key: "terms",
  path: "/terms",
  title: "Terms and Conditions",
  updated: "2026-10-18",
  description:
    "The terms for using MyOtherApp: your account, acceptable use, reporting and blocking, what clubs are responsible for, club plans, payments and refunds, and the limits of our liability.",
  intro: [
    [
      "p",
      'Welcome to MyOtherApp! These Terms and Conditions ("Terms") govern your access to and use of MyOtherApp: our mobile app for iOS and Android (the "App"), our website at myotherapp.in, the clubs dashboard at clubs-next.myotherapp.in, and the websites we host for clubs at their own myotherapp.in addresses or on their own domains (together, the "Service"). By downloading, installing, or using the Service, you agree to be bound by these Terms. If you do not agree with any part of these Terms, please do not use the Service.',
    ],
  ],
  sections: [
    {
      id: "ownership",
      heading: "Ownership",
      blocks: [
        [
          "p",
          'MyOtherApp is developed and managed by Edwin Emmanuel Roy and Muhammed R ("we," "us," or "our"). While we are not a registered company, we strive to provide a reliable and user-friendly experience through the Service.',
        ],
      ],
    },
    {
      id: "the-service",
      heading: "What MyOtherApp Is",
      blocks: [
        [
          "p",
          "MyOtherApp is a platform where clubs and organisations host their events, and where people discover those events and register for them. Clubs publish events, take registrations and payments, check people in, issue certificates, run live rooms and post to their followers. Attendees find events, register, get their tickets and follow clubs.",
        ],
        [
          "p",
          "We provide the platform. We don't organise or run the events listed on it: the club or organisation that lists an event is responsible for it.",
        ],
      ],
    },
    {
      id: "eligibility",
      heading: "Eligibility",
      blocks: [
        [
          "p",
          "MyOtherApp is made for students and the clubs and organisations they belong to, and is not directed at children. By using the Service, you confirm that you will comply with these Terms and applicable laws while using it.",
        ],
      ],
    },
    {
      id: "your-account",
      heading: "Your Account",
      blocks: [
        [
          "ul",
          [
            "**Signing in:** you can sign in with Google, with Apple, or with an email address and password. If you use an email address, we may ask you to confirm it with a code we send to it.",
            "**Registering without an account:** on our website you can register for an event with your name, email address and phone number, without an account. Your ticket is sent to that email address.",
            "**Bringing those registrations into your account:** if you later sign in with an account that has the same email address, and that address is verified, the registrations and tickets made under it move into your account. Google and Apple verify their addresses; for an email account, you verify yours with the code we send.",
            "**Deleting your account:** you can delete your account at any time. See [Deleting your account](/privacy#delete-account) for how, and for what is deleted and what is kept.",
          ],
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
            "**Provide Accurate Information:** All users must provide true, complete, and up-to-date information during registration and while using the Service. Any false or misleading details may result in disqualification from events, revocation of issued certificates, or suspension from the platform.",
            "**Show Identification When Asked:** Organisers may ask you to show identification at their events, such as a college ID or a government-issued ID. MyOtherApp does not verify your identity itself. If you can't show what the organiser asks for, they may refuse you entry.",
            `**Account Security:** Users are responsible for maintaining the confidentiality of their login credentials. Any unauthorized access or suspicious activity should be reported immediately to ${mail}.`,
            "**Compliance with Laws:** Users must not engage in fraudulent activities, violate laws, or attempt to misuse the platform in any manner, and must follow the Acceptable Use rules below.",
          ],
        ],
        ["p", "We reserve the right to suspend or terminate accounts that violate these responsibilities."],
      ],
    },
    {
      id: "acceptable-use",
      heading: "Acceptable Use",
      blocks: [
        [
          "p",
          "MyOtherApp has **zero tolerance for objectionable content and abusive users**. These rules apply to everything posted or sent through the Service: thread comments, posts and announcements from clubs, live-room questions and answers, reviews, event listings, and club websites.",
        ],
        ["p", "You must not post, send or share anything that is or contains:"],
        [
          "ul",
          [
            "**Spam:** unsolicited advertising, repeated or bulk posting, scams, or misleading links.",
            "**Harassment:** bullying, threats, intimidation, stalking, sharing someone's personal information without their consent, or targeting a person to humiliate them.",
            "**Hate:** content that attacks or demeans people because of their race, ethnicity, caste, religion, nationality, sex, gender, sexual orientation, disability or any similar characteristic.",
            "**Sexual content:** nudity, pornography or sexually explicit material, and anything at all that sexualises minors.",
            "**Violence:** threats of violence, graphic violence, or content that promotes or glorifies violence, self-harm or terrorism.",
            "**Misinformation:** false or misleading information that could cause harm, including fake events and false claims about an event, a club or a person.",
            "**Illegal content:** anything that breaks the law or helps someone else break it, including content that infringes someone else's copyright, trademark or privacy.",
            "**Impersonation:** pretending to be another person, club or organisation, or falsely claiming to represent one.",
          ],
        ],
        [
          "p",
          "You also must not commit fraud, try to get around the Service's security or into anyone else's account, or otherwise misuse the Service.",
        ],
        [
          "p",
          "If you break these rules, we may remove your content and suspend or terminate your account, without warning. We may report illegal content to the authorities.",
        ],
      ],
    },
    {
      id: "your-content",
      heading: "Your Content",
      blocks: [
        [
          "p",
          "In the App you can comment on club threads, vote in polls and like posts. Clubs post threads and announcements, and run live rooms where attendees ask questions and answer quizzes and polls. Comments on threads are public: anyone can read them, with the commenter's name, in the App and on our website.",
        ],
        [
          "p",
          "You are responsible for what you post, and you keep any rights you have in it. You allow us to store, display and share it within the Service so that the Service works as intended, for example by showing your comment to the people reading the thread. You can delete your own comments at any time.",
        ],
        [
          "p",
          "We don't pre-screen everything posted on MyOtherApp, but we act on reports, and we may remove any content that breaks these Terms.",
        ],
      ],
    },
    {
      id: "reporting-and-blocking",
      heading: "Reporting and Blocking",
      blocks: [
        ["p", "If you see something that breaks these Terms, please report it."],
        [
          "ul",
          [
            "**A post or a comment, in the App:** open the **⋯** menu on it and choose **Report post** or **Report comment**. Pick a reason (spam or scam, harassment or bullying, hate speech or symbols, sexual content, violence or threats, false information, or something else) and add a note if you like.",
            "**A person, in the App:** to stop seeing someone's comments, open the **⋯** menu on one of their comments and choose **Block**, followed by their name. They won't be told. You can unblock them under **Settings → Blocked Users**.",
            `**A person, a club, or anything else, by email:** write to ${mail} with a link to or a screenshot of what you're reporting, and tell us why.`,
          ],
        ],
        [
          "p",
          "**We review reports and act within 24 hours, which may include removing content and suspending or terminating accounts.** A comment that three different people report is hidden straight away while we review it.",
        ],
      ],
    },
    {
      id: "clubs-and-organisers",
      heading: "Clubs and Organisers",
      blocks: [
        [
          "p",
          "If you run a club or organisation on MyOtherApp, or are on a club's team, you accept these Terms for the club as well as for yourself. The club is responsible for:",
        ],
        [
          "ul",
          [
            "**Its events:** describing each event accurately, including its date, venue, price and what's included; running it as described; and the safety of the people who attend.",
            "**Its posts:** everything it posts or sends through the Service, including threads, announcements, live rooms, emails, messages and its club website. All of it must follow the Acceptable Use rules.",
            "**Attendee data:** using the registration details it receives only for its events and activities, keeping them secure, and following the data-protection laws that apply to it.",
            "**Payments to its own Razorpay account:** if a club connects its own Razorpay account, payments for its events go straight to that account. The club is then responsible for those payments, including refunds, chargebacks and disputes, and for following Razorpay's terms. MyOtherApp is not a party to those payments.",
            "**Its team:** who it gives access to its dashboard, and what they do there.",
          ],
        ],
        ["p", "We may remove an event, a post or a club, or suspend a club's account, if it breaks these Terms."],
      ],
    },
    {
      id: "plans-for-clubs",
      heading: "Plans for Clubs",
      blocks: [
        ["p", "Clubs can use MyOtherApp on the Free plan or on a paid plan. The plans, their prices and what each includes are on our [Pricing](/pricing) page."],
        [
          "ul",
          [
            "**Billing:** paid plans are billed in advance, monthly or yearly, through Razorpay, as a recurring payment you authorise at checkout.",
            "**Free trials:** some plans start with a free trial. Each club gets one trial. Billing starts when the trial ends, unless you cancel before then.",
            "**Renewals:** a paid plan renews automatically at the end of each month or year until you cancel it.",
            "**Grace period:** if a renewal payment fails, Razorpay tries again, and your club keeps its plan while it does. If Razorpay stops trying, a club that has paid before keeps its plan for a grace period of 7 more days, so that it can pay.",
            "**Downgrade to Free:** if the grace period ends without payment, or a cancelled plan reaches the end of its period, your club moves to the Free plan, and the Free plan's limits apply from then on.",
            "**Cancelling:** you can cancel at any time from your club's dashboard. Your plan stays active until the end of the period you've paid for, or the end of your trial, and you won't be charged again.",
            `**Refunds:** we don't refund the unused part of a period. If you think you were charged by mistake, write to ${mail}.`,
          ],
        ],
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
        [
          "p",
          "Payments are processed by Razorpay. Depending on the event, your payment goes either to MyOtherApp's Razorpay account or straight to the organising club's own Razorpay account, if the club has connected one. Your ticket is confirmed once the payment goes through.",
        ],
        ["h3", "Refund Policy"],
        [
          "ul",
          [
            "**No Refunds for User-Initiated Cancellations** – Once an event registration is completed, no refunds will be provided if a participant cancels or fails to attend the event, unless the organiser offers refunds for its event.",
            "**Refunds for Event Cancellations** – If an event is cancelled by the event organizer, conducting club, or community, the responsibility of issuing refunds lies with the organizing committee.",
            "**Payments to MyOtherApp's Razorpay Account** – We issue refunds when the organiser asks us to, as a full refund to the way you paid.",
            "**Payments to a Club's Own Razorpay Account** – The club issues refunds itself and handles any dispute or chargeback through Razorpay. MyOtherApp cannot refund these payments.",
          ],
        ],
        ["p", `Questions about a refund should go to the organiser first. If you can't reach them, write to ${mail} and we'll help where we can.`],
        ["h3", "Payment Transparency"],
        [
          "p",
          "The total amount payable will be clearly displayed during checkout before confirming the payment. MyOtherApp does not currently add a platform fee or a payment-processing fee to it; if that changes, any fee will be shown at checkout before you pay.",
        ],
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
        ["p", "Reviews must be respectful and constructive, and must follow the Acceptable Use rules. Any review containing abusive language, hate speech, or inappropriate content will be deleted."],
        ["p", "However, the rating provided with the review will still be considered."],
        ["h3", "Moderation & Rights"],
        ["p", "MyOtherApp reserves the right to remove or moderate reviews that violate content guidelines."],
        ["p", "Users are encouraged to provide honest feedback to help event hosts improve future events."],
      ],
    },
    {
      id: "suspension-and-termination",
      heading: "Suspension and Termination",
      blocks: [
        ["p", "You can stop using MyOtherApp, and [delete your account](/privacy#delete-account), at any time."],
        [
          "p",
          "We may suspend or terminate your account, or a club's account, and remove content, if you break these Terms, if the law requires it, or to protect other users or MyOtherApp. A suspended account can't be signed in to.",
        ],
      ],
    },
    {
      id: "limitations-of-liability",
      heading: "Limitations of Liability",
      blocks: [
        ["h3", "Use of the App at Your Own Risk"],
        [
          "p",
          'MyOtherApp is provided on an "as-is" and "as-available" basis. While we strive to ensure a seamless user experience, we do not guarantee that the Service will always be available, error-free, or uninterrupted.',
        ],
        ["p", "Users acknowledge that they use the Service at their own risk, and we shall not be liable for any technical issues, data loss, or service interruptions that may occur."],
        ["h3", "No Liability for Third-Party Actions"],
        [
          "p",
          "MyOtherApp acts as a platform that facilitates event registrations but does not organize or control the events listed by communities which are not under the direct control of MyOtherApp.",
        ],
        ["p", "We are not responsible for the actions, decisions, or policies of event hosts, organizers, or third-party service providers (such as payment gateways)."],
        ["p", "Any disputes related to event content, execution, or refunds must be addressed directly with the event organizers."],
        ["h3", "No Responsibility for Financial Transactions"],
        ["p", "Payments made through MyOtherApp are processed by Razorpay, and the total is clearly displayed at checkout."],
        ["p", "We do not receive or store your card or bank details; payments are handled through secure third-party payment processors."],
        ["p", "We are not responsible for any unauthorized transactions, failed payments, or refund disputes."],
        ["h3", "User Content and Misconduct"],
        [
          "p",
          "We don't pre-screen everything posted on MyOtherApp, but we act on reports (see [Reporting and Blocking](/terms#reporting-and-blocking)) and may remove content, suspend or terminate accounts, or take other necessary action when users violate our terms. Content posted by users and clubs is their own, and they are responsible for it.",
        ],
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
        ["ul", ["Your violation of these Terms.", "Your participation in events or transactions through the Service.", "Any third-party claims related to your use of the platform."]],
        ["h3", "Exclusions and Jurisdiction"],
        ["p", "Some jurisdictions may not allow certain liability exclusions or limitations, so parts of this section may not apply to all users."],
        ["p", "In such cases, our liability will be limited to the maximum extent permitted by applicable laws."],
      ],
    },
    {
      id: "changes-to-these-terms",
      heading: "Changes to These Terms",
      blocks: [
        [
          "p",
          "We may update these Terms. If we change anything major, we'll let you know via the App or email, and the date at the top shows when they last changed. If you keep using the Service after a change, you accept the updated Terms.",
        ],
      ],
    },
    {
      id: "contact-us",
      heading: "Contact Us",
      blocks: [["p", `Questions about these Terms, or something to report? Write to us at ${mail}.`]],
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
