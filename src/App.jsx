import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "@/components/home";
import Form from "@/components/form";
import Ticket from "@/components/ticket";
import Certificate from "@/components/certificate";
import NotFound from "@/components/notfound";
import Live from "@/components/live";
import Play from "@/components/play";
import Feedback from "@/components/feedback";

function App() {
  const RedirectToExternal = () => {
    useEffect(() => {
      window.location.href = "https://myotherapp.in";
    }, []);

    return null;
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<RedirectToExternal />} />
        <Route path="/:eventId" element={<Home />} />
        <Route path="/:eventId/live" element={<Live />} />
        <Route path="/play/:eventId" element={<Play />} />
        <Route path="/feedback/:eventId/:registrationId" element={<Feedback />} />
        <Route path="*" element={<NotFound />} />
        <Route path="/register/:eventId" element={<Form />} />
        <Route path="/tickets/:ticketid" element={<Ticket />} />
        <Route path="/certificates/:ticketid" element={<Certificate />} />
      </Routes>
    </Router>
  );
}

export default App;
