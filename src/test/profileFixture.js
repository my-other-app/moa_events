/**
 * A PublicProfile as GET /api/v1/profiles/{handle} sends it to someone
 * signed out (feature-register/profiles-networking-contract.md and the
 * backend's app/api/profiles/schemas.py). `picture` and each project's
 * `image` are one link each (the medium size), signed and expiring within
 * the hour: the page must never hold one.
 */
const PRESIGNED = (key) => `https://moa-media.s3.amazonaws.com/${key}?X-Amz-Date=20991231T000000Z&X-Amz-Expires=3600&X-Amz-Signature=abc`;

export const PUBLIC_PROFILE = (over = {}) => ({
  handle: "asha",
  full_name: "Asha Rao",
  user_id: null,
  picture: PRESIGNED("p/asha-m.jpg"),
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
      image: PRESIGNED("pr/11-m.jpg"),
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

/**
 * What a stranger gets for a private profile: every key is there, the rest
 * null or empty, every section hidden, never indexable.
 */
export const PRIVATE_PROFILE = (over = {}) => ({
  user_id: null,
  handle: "asha",
  full_name: "Asha Rao",
  picture: PRESIGNED("p/asha-m.jpg"),
  headline: "Compiler engineer",
  bio: null,
  city: null,
  org: null,
  interests: [],
  links: [],
  projects: [],
  achievements: { events_attended: null, certificates: null, talks: null, clubs: null },
  contact: { email: null, phone: null },
  hidden_sections: ["links", "projects", "achievements", "interests", "org"],
  private: true,
  indexable: false,
  is_me: false,
  relation: null,
  ...over,
});
