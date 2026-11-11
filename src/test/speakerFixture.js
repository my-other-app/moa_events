/** A speaker's public page as GET /api/v1/speakers/{slug} sends it (feature-register/speakers-contract.md), with presigned-looking links. */
export const SPEAKER = (over = {}) => ({
  slug: "asha-rao",
  name: "Asha Rao",
  headline: "Engineer · Zoho",
  bio: "Builds compilers.\r\nTeaches on weekends.",
  photo: { thumbnail: "https://bucket.s3.amazonaws.com/a-t.jpg?X-Amz-Expires=3600", medium: "https://bucket.s3.amazonaws.com/a-m.jpg?X-Amz-Expires=3600" },
  links: { website: "asha.dev", linkedin: "https://linkedin.com/in/asha", x: "javascript:alert(1)", github: "", other: null },
  city: "Kochi",
  topics: [{ id: 3, name: "Development", slug: "development" }],
  claimed: true,
  followers_count: 41,
  following: null,
  talks: {
    upcoming: [{ event_id: 68, slug: "hack-night-04", name: "Hack Night 04", date: "2026-12-08T18:00:00+05:30", ends_at: "2026-12-08T21:00:00+05:30", club: { id: 4, name: "Circuit Society", slug: "circuit-society" }, talk_title: "Writing a tiny compiler", poster: "https://bucket.s3.amazonaws.com/p.jpg?X-Amz-Expires=3600" }],
    past: [{ event_id: 12, slug: "devfest-25", name: "DevFest 25", date: "2025-11-01T10:00:00+05:30", ends_at: null, club: { id: 5, name: "GDG Kochi", slug: "gdg-kochi" }, talk_title: null, poster: null }],
  },
  updated_at: "2026-11-10T09:00:00Z",
  ...over,
});
