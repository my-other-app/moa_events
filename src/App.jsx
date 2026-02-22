import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "@/components/home";
import Form from "@/components/form";
import Ticket from "@/components/ticket";
import NotFound from "@/components/notfound";

function App() {
  const RedirectToExternal = () => {
    useEffect(() => {
      window.location.href = "https://myotherapp.com";
    }, []);
  
    return null;
  };

  return (
    <Router>
      <Routes>
      <Route path="/" element={<RedirectToExternal />} />
        <Route path="/:eventId" element={<Home />} />
        <Route path="*" element={<NotFound />} />
        <Route path="/register" element={<Form />} />
        <Route path="/tickets/:ticketid" element={<Ticket />} />
      </Routes>
    </Router>
  );
}

export default App;
