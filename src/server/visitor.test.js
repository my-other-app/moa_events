// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isIp, readVisitor } from "./visitor";

describe("the visitor of a request", () => {
  it("is the first address Vercel forwards, else its X-Real-IP; never a name or a list", () => {
    expect(readVisitor(new Headers({ "x-forwarded-for": "49.37.10.2, 76.76.21.9" })).ip).toBe("49.37.10.2");
    expect(readVisitor(new Headers({ "x-forwarded-for": "2401:4900:1c2a::1" })).ip).toBe("2401:4900:1c2a::1");
    expect(readVisitor(new Headers({ "x-forwarded-for": "unknown", "x-real-ip": "49.37.10.3" })).ip).toBe("49.37.10.3");
    expect(readVisitor(new Headers({})).ip).toBeNull();
    for (const bad of ["evil.example", "1.2.3", "300.1.1.1", "", "1.2.3.4 5"]) expect(isIp(bad)).toBe(false);
    expect(isIp("::1")).toBe(true);
  });

  it("is placed where Vercel's edge put them, the city decoded; nowhere without a point", () => {
    const h = new Headers({
      "x-vercel-ip-latitude": "9.9312",
      "x-vercel-ip-longitude": "76.2673",
      "x-vercel-ip-city": "Thiruvananthapuram%20East",
      "x-vercel-ip-country-region": "KL",
      "x-vercel-ip-country": "IN",
    });
    expect(readVisitor(h).geo).toEqual({ lat: 9.9312, lng: 76.2673, city: "Thiruvananthapuram East", region: "KL", country: "IN" });
    expect(readVisitor(new Headers({ "x-vercel-ip-latitude": "9.9" })).geo).toBeNull();
    expect(readVisitor(new Headers({ "x-vercel-ip-latitude": "99", "x-vercel-ip-longitude": "10" })).geo).toBeNull();
    expect(readVisitor(new Headers({ "x-vercel-ip-latitude": "0", "x-vercel-ip-longitude": "0" })).geo).toBeNull();
    // A plain object of headers reads the same.
    expect(readVisitor({ "x-forwarded-for": "49.37.10.2" }).ip).toBe("49.37.10.2");
  });
});
