/**
 * For tests of the client pages: each at its address, as src/app mounts
 * it, on react-router's <Routes> (run inside a <MemoryRouter>). Which
 * address reaches which page in the real site is Next's file routing,
 * checked in src/app/routes.test.js.
 */
import { Route, Routes } from "react-router-dom";
import { ThreadPage, ThreadsPage } from "@/components/discover/threadspage";
import { FollowingPage, MyTicketsPage } from "@/components/me/mepages";
import NotFound from "@/components/notfound";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/threads" element={<ThreadsPage />} />
      <Route path="/threads/:id" element={<ThreadPage />} />
      <Route path="/me/tickets" element={<MyTicketsPage />} />
      <Route path="/me/following" element={<FollowingPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
