import React from "react";
import { useNavigate } from "react-router-dom";
import "../styles/registerbutton.css";

const RegisterButton = ({ eventData, countdown, isRegistrationClosed }) => {
  const navigate = useNavigate();

  const handleRegister = () => {
    if (!isRegistrationClosed) {
      navigate("/register", {
        state: {
          eventId: eventData.id,
          additionalDetails: eventData.additional_details || [],
        },
      });
    }
  };

  if (!eventData) return null;

  return (
    <div className="mobile-register-container">
      <p className="register-alert">
        {isRegistrationClosed ? "Registration closed" : `Registration closes in ${countdown}`}
      </p>
      <button
        className="register-btn mobile-register-btn"
        onClick={handleRegister}
        disabled={isRegistrationClosed}
      >
        {isRegistrationClosed ? "REGISTRATION CLOSED" : "REGISTER NOW"}
      </button>
    </div>
  );
};

export default RegisterButton;
