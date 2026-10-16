import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/components/home";
import Form from "@/components/form";
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
import { ThreadPage, ThreadsPage } from "@/components/discover/threadspage";

/**
 * Every address the site answers. The discovery pages (/, /events, /clubs,
 * /threads) are fixed words, so they always win over an event's `/:eventId`;
 * the addresses printed on posters and tickets keep working as they were.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DiscoverHome />} />
      <Route path="/events" element={<FindEvents />} />
      <Route path="/clubs" element={<FindClubs />} />
      <Route path="/clubs/:slug" element={<ClubPage />} />
      <Route path="/threads" element={<ThreadsPage />} />
      <Route path="/threads/:id" element={<ThreadPage />} />
      <Route path="/:eventId" element={<Home />} />
      <Route path="/:eventId/live" element={<Live />} />
      <Route path="/:eventId/compete" element={<Compete />} />
      <Route path="/play/:eventId" element={<Play />} />
      <Route path="/feedback/:eventId/:registrationId" element={<Feedback />} />
      <Route path="/register/:eventId" element={<Form />} />
      <Route path="/tickets/:ticketid" element={<Ticket />} />
      <Route path="/certificates/:ticketid" element={<Certificate />} />
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
