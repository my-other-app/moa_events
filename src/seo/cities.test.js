// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CITIES, addressOf, cityBySlug, cityInText, cityNear, cityOf, distanceKm, postalCodeOf } from "./cities";

/* Which city a venue is in, from the words and points production events actually carry. */
describe("matching a place to a city", () => {
  it("reads the city a venue's words name last, by any name it goes by", () => {
    expect(cityInText("Thuruthu Coworks, 2nd floor, 41/1180 Panampilly Avenue, Panampilly Nagar, Kochi 682036")?.slug).toBe("kochi");
    expect(cityInText("Kunhimangalam mangroves, boardwalk entrance, Kunhimangalam, Payyannur, Kannur 670309")?.slug).toBe("kannur");
    expect(cityInText("Charupadi Workspace, Kazhakkoottam-Kovalam Bypass, Kazhakkoottam, Thiruvananthapuram 695582")?.slug).toBe("thiruvananthapuram");
    expect(cityInText("Lulu Mall, Edappally, Ernakulam")?.slug).toBe("kochi");
    expect(cityInText("Technopark Phase 3, Trivandrum")?.slug).toBe("thiruvananthapuram");
    expect(cityInText("Hilite Mall, Calicut")?.slug).toBe("kozhikode");
    expect(cityInText("ROLL NO. 4, BANGALORE")?.slug).toBe("bengaluru");
  });

  it("matches whole words only, and nothing for words that name no city", () => {
    expect(cityInText("Kochikaran Hall")).toBeNull();
    expect(cityInText("Online")).toBeNull();
    expect(cityInText("")).toBeNull();
    expect(cityInText(null)).toBeNull();
  });

  it("falls back to the nearest city whose radius holds the point", () => {
    expect(cityNear({ lat: 9.9627, lng: 76.2955 })?.slug).toBe("kochi");
    expect(cityNear({ lat: 11.2574, lng: 75.7674 })?.slug).toBe("kozhikode");
    expect(cityNear({ lat: 9.58, lng: 76.523 })?.slug).toBe("kottayam");
    // The middle of the Arabian Sea, and the "no point" 0,0.
    expect(cityNear({ lat: 12, lng: 68 })).toBeNull();
    expect(cityNear({ lat: 0, lng: 0 })).toBeNull();
    expect(cityNear({ lat: null, lng: null })).toBeNull();
  });

  it("prefers the words to the point, and puts online events nowhere", () => {
    // A venue in Thrissur whose pin was dropped in Kochi is in Thrissur.
    expect(cityOf({ location_name: "Old NCC Room, Ollur, Thrissur", lat: 9.98, lng: 76.3 })?.slug).toBe("thrissur");
    expect(cityOf({ location_name: "Ilaveyil Farmstay, Vagamon, Idukki", lat: 9.957, lng: 76.292 })?.slug).toBe("kochi");
    expect(cityOf({ location_name: "Kochi", is_online: true })).toBeNull();
  });

  it("knows Kerala's six big cities first, each a page address and inside its own radius", () => {
    expect(CITIES.slice(0, 6).map((c) => c.slug)).toEqual(["kochi", "thiruvananthapuram", "kozhikode", "thrissur", "kannur", "kottayam"]);
    expect(new Set(CITIES.map((c) => c.slug)).size).toBe(CITIES.length);
    for (const c of CITIES) {
      expect(c.slug).toMatch(/^[a-z][a-z-]*$/);
      expect(cityBySlug(c.slug)).toBe(c);
      expect(cityNear(c)).toBe(c);
    }
    expect(cityBySlug("KOCHI")?.name).toBe("Kochi");
    expect(cityBySlug("atlantis")).toBeNull();
    expect(distanceKm(cityBySlug("kochi"), cityBySlug("thiruvananthapuram"))).toBeGreaterThan(150);
  });
});

describe("a venue's postal address", () => {
  it("finds the PIN code, written either way, and never mistakes a door number for one", () => {
    expect(postalCodeOf("Panampilly Nagar, Kochi 682036")).toBe("682036");
    expect(postalCodeOf("Beach Road, Kozhikode 673 032")).toBe("673032");
    expect(postalCodeOf("TC 92/1410, Kazhakkoottam")).toBeNull();
    expect(postalCodeOf("41/1180 Panampilly Avenue")).toBeNull();
    expect(postalCodeOf("Room 012345")).toBeNull();
  });

  it("is the city, its state and the PIN code, in India", () => {
    expect(addressOf({ location_name: "Thuruthu Coworks, Panampilly Nagar, Kochi 682036", lat: 9.96, lng: 76.29 })).toEqual({
      addressLocality: "Kochi",
      addressRegion: "Kerala",
      postalCode: "682036",
      addressCountry: "IN",
    });
    expect(addressOf({ location_name: "Somewhere quiet" })).toEqual({ addressLocality: null, addressRegion: null, postalCode: null, addressCountry: "IN" });
  });
});
