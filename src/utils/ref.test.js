import { beforeEach, describe, expect, it } from "vitest";

import { currentRef, rememberRef } from "./ref";

describe("the tracking ref", () => {
  beforeEach(() => sessionStorage.clear());

  it("is remembered from the landing URL and read back for the sign-up", () => {
    rememberRef("?utm_source=instagram&ref=X7K2M9PQ");
    expect(currentRef()).toBe("x7k2m9pq");
  });

  it("ignores anything that is not a code", () => {
    rememberRef("?ref=<script>alert(1)</script>");
    expect(currentRef()).toBeNull();
    rememberRef("?utm_source=instagram");
    expect(currentRef()).toBeNull();
  });
});
