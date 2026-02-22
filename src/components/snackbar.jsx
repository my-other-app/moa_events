import React from "react";
import "../styles/snackbar.css";

const Snackbar = ({ message, onClose }) => {
  return (
    <div className="snackbar">
      <p className="snackbar-message">{message}</p>
      <button className="snackbar-close-btn" onClick={onClose}>
        CLOSE
      </button>
    </div>
  );
};

export default Snackbar;
