/**
 * A PublicProfile as GET /api/v1/profiles/{handle} sends it to someone
 * signed out (feature-register/profiles-networking-contract.md), with
 * presigned picture links (the page must never hold one).
 */
const PRESIGNED = (key) => `https://moa-media.s3.amazonaws.com/${key}?X-Amz-Date=20991231T000000Z&X-Amz-Expires=3600&X-Amz-Signature=abc`;

export const PUBLIC_PROFILE = (over = {}) => ({
  handle: "asha",
  full_name: "Asha Rao",
  picture: { thumbnail: PRESIGNED("p/asha-t.jpg"), medium: PRESIGNED("p/asha-m.jpg"), original: PRESIGNED("p/asha.jpg") },
  headline: "Compiler engineer",
  bio: "Builds compilers.\nTeaches on weekends.",
  city: "Kochi",
  org: { id: 4, name: "Zoho" },
  interests: [
    { id: 1, name: "Open source", emoji: "🛠️" },
    { id: 2, name: "Music", emoji: null },
  ],
  links: [
    { type: "github", url: "https://github.com/asha", label: null },
    { type: "website", url: "https://asha.dev/", label: "My site" },
  ],
  projects: [
    {
      id: 11,
      title: "Tiny C",
      summary: "A C compiler in 2,000 lines.",
      url: "https://github.com/asha/tinyc",
      image: { thumbnail: PRESIGNED("pr/11-t.jpg"), medium: PRESIGNED("pr/11-m.jpg") },
      tags: ["compilers", "c"],
      role: "Author",
      month: "2026-03-01",
    },
  ],
  achievements: {
    events_attended: 12,
    certificates: [{ event_name: "DevFest 25", url: "https://myotherapp.in/certificates/abc-123" }],
    talks: [{ event_name: "Hack Night 04", title: "Writing a tiny compiler", event_slug: "hack-night-04" }],
    clubs: null,
  },
  contact: { email: null, phone: null },
  hidden_sections: [],
  private: false,
  indexable: false,
  is_me: false,
  relation: null,
  ...over,
});

/** What a stranger gets for a private profile. */
export const PRIVATE_PROFILE = (over = {}) => ({
  handle: "asha",
  full_name: "Asha Rao",
  picture: null,
  headline: "Compiler engineer",
  private: true,
  ...over,
});
