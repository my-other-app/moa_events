/**
 * What the About page says, as plain data the link-preview function can
 * serve too. Only what MyOtherApp does today: no story, no names, no
 * numbers beyond the live ones the API reports.
 */

export const ABOUT = {
  path: "/about",
  title: "About MyOtherApp",
  description:
    "MyOtherApp is where student clubs run their events and students find them: discover events near you, register in a minute, walk in with a QR ticket.",
  lede: "MyOtherApp is where student clubs run their events — and where students find them. Clubs plan, sell and run their events here; students discover what's on near them, register in a minute and walk in with a QR ticket.",
  students: [
    { icon: "search", title: "Discover events and clubs near you", text: "Hackathons, workshops and meetups from the clubs around you — by day, place, price and category." },
    { icon: "zap", title: "Register in a minute", text: "A short form, and your ticket is in your email — and in the app, once you sign in." },
    { icon: "qr", title: "Tickets with QR entry", text: "Show the QR code at the door and you're checked in." },
    {
      icon: "award",
      title: "Certificates",
      text: "Your certificate after the event, ready to download — and anyone can check it's genuine by its number.",
      link: { to: "/verify", label: "Verify a certificate" },
    },
    { icon: "monitor", title: "Live rooms", text: "Quizzes, polls and Q&A while the event is on, from your phone." },
    { icon: "comment", title: "Club threads", text: "Follow clubs and keep up with their posts and polls." },
  ],
  clubs: [
    { icon: "layout", title: "Events, registrations and payments", text: "Publish events, take registrations and collect fees from one dashboard." },
    { icon: "checkSquare", title: "Check-in at the door", text: "Scan tickets as people arrive and see who is in." },
    { icon: "award", title: "Certificates", text: "Issue certificates to the people who came." },
    { icon: "globe", title: "Club websites", text: "A website for your club, with your events on it." },
    { icon: "link", title: "Tracking links", text: "Share a link per poster, post or group, and see which one brings people in." },
    { icon: "barChart", title: "Analytics", text: "See registrations, visits and where your people came from." },
  ],
  steps: [
    { title: "A club posts an event", text: "On the clubs dashboard: the details, the tickets, and the fee if there is one." },
    { title: "Students find it and register", text: "Here on the website or in the app. It takes a minute, and the ticket arrives by email." },
    { title: "Everyone shows up", text: "QR check-in at the door, the live room during the event, the certificate after." },
  ],
};
