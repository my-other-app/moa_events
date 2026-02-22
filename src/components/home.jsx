import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "@/styles/home.css";

import RegisterButton from "@/components/registerbutton";
import { fetchEvent } from "@/utils/fetchevent";
import Snackbar from "./snackbar";

import logo from "../assets/wordmark 1.svg";
import shareicon from "../assets/Icon.svg";
import calendar from "../assets/Calendar.svg";
import clock from "../assets/clock.svg";
import money from "../assets/money.svg";
import hourglass from "../assets/hourglass.svg";
import PlaceMarker from "../assets/Place Marker.svg";
import Trophy from "../assets/Trophy.svg";

const Home = () => {
  const navigate = useNavigate();
  const { eventId } = useParams();
  const [eventData, setEventData] = useState(null);
  const [countdown, setCountdown] = useState("");
  const [isRegistrationClosed, setIsRegistrationClosed] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [loading, setLoading] = useState(true);

  const handleSnackbar = (message) => {
    setSnackbarMessage(message);
    setShowSnackbar(true);
  };

  const closeSnackbar = () => {
    setShowSnackbar(false);
  };

  const handleRegister = () => {
    navigate("/register", {
      state: {
        eventId: eventData.id,
        additionalDetails: eventData.additional_details || [],
      },
    });
  };

  useEffect(() => {
    if (!eventId) return;

    setLoading(true); // Show loader immediately

    const getEvents = async () => {
      try {
        const fetchedEvents = await fetchEvent(eventId);
        setEventData(fetchedEvents);
        console.log("Event fetched:", fetchedEvents);
      } catch (error) {
        console.error("Error fetching event:", error);
      } finally {
        setTimeout(() => setLoading(false), 1000); // Small delay
      }
    };

    getEvents();
  }, []);

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
