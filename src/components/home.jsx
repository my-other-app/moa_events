import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "@/styles/home.css";

import RegisterButton from "@/components/registerbutton";
import { eventsApi } from "@/api/events";
import { liveApi } from "@/api/live";
import { competitionApi } from "@/api/competition";
import { roomIsActive } from "@/utils/live";
import "@/styles/live.css";
import Snackbar from "./snackbar";

import logo from "../assets/wordmark 1.svg";
import shareicon from "../assets/Icon.svg";
import calendar from "../assets/Calendar.svg";
import clock from "../assets/clock.svg";
import money from "../assets/money.svg";
import hourglass from "../assets/hourglass.svg";
import PlaceMarker from "../assets/Place Marker.svg";
import Trophy from "../assets/Trophy.svg";

const agendaTime = (iso, tz) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const agendaDay = (iso, tz) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const dayOf = (iso, tz) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** The run of show, grouped by day when it spans more than one; parallel tracks are marked. */
export const Agenda = ({ agenda }) => {
  const tz = agenda.timezone || "Asia/Kolkata";
  const days = [...new Set(agenda.items.map((i) => dayOf(i.starts_at, tz)))];
  return (
    <section className="agenda" aria-labelledby="agenda-heading">
      <h3 id="agenda-heading">Agenda</h3>
      {days.map((day) => (
        <div key={day} className="agenda-day">
          {days.length > 1 && <div className="agenda-day-heading">{agendaDay(agenda.items.find((i) => dayOf(i.starts_at, tz) === day).starts_at, tz)}</div>}
          <ul className="agenda-list">
            {agenda.items
              .filter((i) => dayOf(i.starts_at, tz) === day)
              .map((i) => (
                <li key={i.id} className="agenda-item">
                  <div className="agenda-time">
                    {agendaTime(i.starts_at, tz)}
                    {i.ends_at && <span className="agenda-time-end">– {agendaTime(i.ends_at, tz)}</span>}
                  </div>
                  <div className="agenda-body">
                    <div className="agenda-title">
                      {i.title}
                      {i.parallel && <span className="agenda-parallel">Parallel</span>}
                    </div>
                    {(i.speaker || i.location) && (
                      <div className="agenda-meta">{[i.speaker, i.location].filter(Boolean).join(" · ")}</div>
                    )}
                    {i.description && <div className="agenda-desc">{i.description}</div>}
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
};

const Home = () => {
  const navigate = useNavigate();
  const { eventId } = useParams();
  const [eventData, setEventData] = useState(null);
  const [countdown, setCountdown] = useState("");
  const [isRegistrationClosed, setIsRegistrationClosed] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const handleSnackbar = (message) => {
    setSnackbarMessage(message);
    setShowSnackbar(true);
  };

  const closeSnackbar = () => {
    setShowSnackbar(false);
  };

  const handleRegister = () => {
    navigate(`/register/${eventData.id}`, {
      state: {
        additionalDetails: eventData.additional_details || [],
      },
    });
  };

  const [agenda, setAgenda] = useState(null);
  // The room: a banner, a poll or a quiz up right now earns a strip at the top.
  const [live, setLive] = useState(null);
  // A competition on the event: the strip that leads a registered guest to their team.
  const [competition, setCompetition] = useState(null);

  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    competitionApi.leaderboard(eventId).then((b) => alive && setCompetition(b)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    const look = () => liveApi.fetchFeed(eventId).then((f) => alive && setLive(f)).catch(() => {});
    look();
    const t = setInterval(look, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    eventsApi.fetchAgenda(eventId).then((a) => {
      if (alive && a && Array.isArray(a.items)) setAgenda(a);
    });
    return () => {
      alive = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;

    setLoading(true);
    setError(false);

    const getEvents = async () => {
      try {
        const fetchedEvents = await eventsApi.fetchEvent(eventId);
        if (fetchedEvents) {
          setEventData(fetchedEvents);
        } else {
          setError(true);
        }
      } catch (error) {
        console.error("Error fetching event:", error);
        setError(true);
      } finally {
        setTimeout(() => setLoading(false), 1000);
      }
    };

    getEvents();
  }, [eventId, retryCount]);

  useEffect(() => {
    if (!eventData) return;

    const updateCountdown = () => {
      const eventTime = new Date(eventData.event_datetime).getTime();
      const currentTime = new Date().getTime();
      const timeLeft = eventTime - currentTime;

      if (timeLeft <= 0) {
        setCountdown("Registration closed");
        setIsRegistrationClosed(true);
        return;
      }

      const hours = Math.floor(timeLeft / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

      setCountdown(`${hours}hrs ${minutes} mins ${seconds}secs`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [eventData]);

  const convertToIST = (gmtDateTime) => {
    const date = new Date(gmtDateTime);
    date.setHours(date.getHours() + 5);
    date.setMinutes(date.getMinutes() + 30);

    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    return `${hours}:${minutes} ${ampm}`;
  };

  if (error) {
    return (
      <div className="loader-container">
        <p>Failed to load this event. Please check your connection and try again.</p>
        <button onClick={() => setRetryCount((c) => c + 1)}>RETRY</button>
      </div>
    );
  }

  if (!eventData) return <p></p>;

  if (loading) {
    return (
      <div className="loader-container">
        <svg className="spinner" viewBox="0 0 50 50">
          <circle
            className="path"
            cx="25"
            cy="25"
            r="20"
            fill="none"
            strokeWidth="5"
          ></circle>
        </svg>
      </div>
    );
  }

  return (
    <div className="hackathon-page">
      <div className="header">
        <div className="logo">
          <img src={logo} alt="Calendar icon" className="logo-icon" />
        </div>
        <button
          className="register-btn"
          onClick={handleRegister}
          disabled={isRegistrationClosed}
        >
          {isRegistrationClosed ? "REGISTRATION CLOSED" : "REGISTER NOW"}
        </button>
      </div>
      <div className="top-header mobile-only">
        <h1>{eventData.category.name}</h1>
        <a href="your-link-here" target="_blank" rel="noopener noreferrer">
          <img src={shareicon} alt="External Link" />
        </a>
      </div>

      <main className="main-content">
        {roomIsActive(live) && (
          <div className="live-strip" role="status">
            <div>
              <span className="live-dot">Live now</span>
              <p>{live.banner ? live.banner.text : live.quiz?.live ? "The quiz is on — join with the code on the screen" : live.poll ? live.poll.prompt : "Questions are being taken from the floor"}</p>
            </div>
            <button type="button" className="live-btn" onClick={() => navigate(`/${eventData.id}/live`)}>
              Open the live room
            </button>
          </div>
        )}
        {competition?.enabled && (
          <div className="live-strip" role="status">
            <div>
              <span className="live-dot">Competition</span>
              <p>{competition.public && competition.rows.length ? `${competition.rows[0].name} leads the board` : "Form a team from your ticket, pick a track, and hand in your work here."}</p>
            </div>
            <button type="button" className="live-btn" onClick={() => navigate(`/${eventData.id}/compete`)}>
              Your team
            </button>
          </div>
        )}
        <div className="banner-container">
          <img
            src={eventData.poster.original}
            alt="Oasis Hackathon Banner"
            className="banner-image"
          />
        </div>

        <div className="event-details">
          <div className="countdown-container">
            <p className="register-alert">
              {isRegistrationClosed
                ? "Registration closed"
                : `Registration closes in ${countdown}`}
            </p>
          </div>
          <h2 className="event-title">{eventData.name}</h2>

          <div className="organizer">
            <img
              src={eventData.club.logo.thumbnail}
              alt="Organizer Logo"
              className="organizer-logo"
            />
            <span>{eventData.club.name}</span>
          </div>

          <div className="info-grid">
            <div className="info-card">
              <img src={calendar} alt="Calendar icon" className="info-icon" />
              <div className="info-label">Date of Event</div>
              <div className="info-value">
                {eventData.event_datetime
                  .split("T")[0]
                  .split("-")
                  .reverse()
                  .join("-")}
              </div>
            </div>

            <div className="info-card">
              <img src={money} alt="Calendar icon" className="info-icon" />
              <div className="info-label">Registration Fee</div>
              <div className="info-value">{eventData.reg_fee}</div>
            </div>

            <div className="info-card">
              <img src={clock} alt="Calendar icon" className="info-icon" />
              <div className="info-label">Time of Event</div>
              <div className="info-value">
                {convertToIST(eventData.event_datetime)}
              </div>
            </div>

            <div className="info-card">
              <img src={hourglass} alt="Calendar icon" className="info-icon" />
              <div className="info-label">Duration</div>
              <div className="info-value">{eventData.duration} hours</div>
            </div>

            <div
              className="info-card"
              onClick={() => handleSnackbar(eventData.location_name)}
            >
              <img
                src={PlaceMarker}
                alt="Location icon"
                className="info-icon"
              />
              <div className="info-label">Location</div>
              <div className="info-value">{eventData.location_name}</div>
            </div>

            <div className="info-card">
              <img src={Trophy} alt="Calendar icon" className="info-icon" />
              <div className="info-label">Prize Worth</div>
              <div className="info-value">{eventData.prize_amount}</div>
            </div>
          </div>

          <div className="description">{eventData.about}</div>

          {agenda && agenda.items.length > 0 && (
            <Agenda agenda={agenda} />
          )}

          <div className="help-section">
            <h3>Need Help?</h3>
            <p>Got any questions? We're here to help—hit us up!</p>
            <a
              href={`tel:${eventData.contact_phone}`}
              className="call-organizer-btn"
            >
              Call Organizer
            </a>
          </div>
        </div>
      </main>
      <RegisterButton
        eventData={eventData}
        countdown={countdown}
        isRegistrationClosed={isRegistrationClosed}
      />
      {showSnackbar && (
        <Snackbar message={snackbarMessage} onClose={closeSnackbar} />
      )}
    </div>
  );
};

export default Home;
