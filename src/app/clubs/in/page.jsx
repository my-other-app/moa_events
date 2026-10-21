import { permanentRedirect } from "next/navigation";
import { CITIES_PATH } from "@/seo/cities";

/* /clubs/in: the cities are listed once, at /events/in (each city's events page links to its clubs). */
export default function ClubsByCity() {
  permanentRedirect(CITIES_PATH);
}
