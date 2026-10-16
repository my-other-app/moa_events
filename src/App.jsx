import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Register from "@/components/register/register";
import Ticket from "@/components/ticket";
import Certificate from "@/components/certificate";
import NotFound from "@/components/notfound";
import Live from "@/components/live";
import Compete from "@/components/compete";
import Play from "@/components/play";
import Feedback from "@/components/feedback";
import DiscoverHome from "@/components/discover/homepage";
import FindEvents from "@/components/discover/eventspage";
import FindClubs from "@/components/discover/clubspage";
import ClubPage from "@/components/discover/clubpage";
import EventPage from "@/components/discover/eventpage";
import { EventScoped, LegacyEventRedirect } from "@/components/discover/eventroutes";
import { ThreadPage, ThreadsPage } from "@/components/discover/threadspage";

/**
 * Every address the site answers. An event lives at /events/{slug}, with
 * its form, live room and competition under it. The discovery pages (/,
 * /events, /clubs, /threads) are fixed words, so they always win over the
 * old event addresses — /{id or slug}, /{ref}/live, /{ref}/compete and
 * /register/{ref} — which are on posters, in emails and in the app's share
 * links, and redirect to the event's page for good.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DiscoverHome />} />
      <Route path="/events" element={<FindEvents />} />
      <Route path="/events/:slug" element={<EventPage />} />
      <Route
        path="/events/:slug/register"
        element={<EventScoped sub="register">{(event, page) => <Register event={event} club={page?.club ?? null} />}</EventScoped>}
      />
      <Route path="/events/:slug/live" element={<EventScoped sub="live">{(event) => <Live eventId={String(event.id)} eventSlug={event.slug} />}</EventScoped>} />
      <Route
        path="/events/:slug/compete"
        element={<EventScoped sub="compete">{(event) => <Compete eventId={String(event.id)} eventSlug={event.slug} />}</EventScoped>}
      />
      <Route path="/clubs" element={<FindClubs />} />
      <Route path="/clubs/:slug" element={<ClubPage />} />
      <Route path="/threads" element={<ThreadsPage />} />
      <Route path="/threads/:id" element={<ThreadPage />} />
      <Route path="/play/:eventId" element={<Play />} />
      <Route path="/feedback/:eventId/:registrationId" element={<Feedback />} />
      <Route path="/tickets/:ticketid" element={<Ticket />} />
      <Route path="/certificates/:ticketid" element={<Certificate />} />
      {/* The old addresses, kept working forever. Listed after the fixed words, which win a tie. */}
      <Route path="/register/:ref" element={<LegacyEventRedirect sub="register" />} />
      <Route path="/:ref" element={<LegacyEventRedirect />} />
      <Route path="/:ref/live" element={<LegacyEventRedirect sub="live" />} />
      <Route path="/:ref/compete" element={<LegacyEventRedirect sub="compete" />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
