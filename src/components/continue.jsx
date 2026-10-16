import "@/styles/registerbutton.css";

const Continue = ({ handleSubmit, disabled }) => {
  return (
    <div className="mobile-register-container continue-btn">
      <button
        className="register-btn mobile-register-btn"
        onClick={handleSubmit}
        disabled={disabled}
      >
        {disabled ? "SUBMITTING..." : "CONTINUE"}
      </button>
    </div>
  );
};

export default Continue;