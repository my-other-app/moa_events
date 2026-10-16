import { beforeEach, describe, expect, it } from "vitest";

import { currentRef, rememberRef } from "./ref";

describe("the tracking ref", () => {
  beforeEach(() => sessionStorage.clear());

  it("is remembered from the landing URL and read back for the sign-up", () => {
    rememberRef("?utm_source=instagram&ref=X7K2M9PQ");
    expect(currentRef()).toBe("x7k2m9pq");
  });

  it("credits the club website's code only when nothing brought the visitor before", () => {
    rememberRef("?sref=WEBS1TE9");
    expect(currentRef()).toBe("webs1te9");
    sessionStorage.clear();
    rememberRef("?ref=X7K2M9PQ&utm_source=instagram");
    rememberRef("?sref=WEBS1TE9");
    expect(currentRef()).toBe("x7k2m9pq");
    // A link opened later still wins over the site.
    rememberRef("?ref=P0STERQR");
    expect(currentRef()).toBe("p0sterqr");
  });

  it("ignores anything that is not a code", () => {
    rememberRef("?ref=<script>alert(1)</script>");
    expect(currentRef()).toBeNull();
    rememberRef("?utm_source=instagram");
    expect(currentRef()).toBeNull();
  });
});
