const Continue = ({ handleSubmit }) => {
  return (
    <div className="mobile-register-container continue-btn">
      <button
        className="register-btn mobile-register-btn"
        onClick={handleSubmit}
      >
        CONTINUE
      </button>
    </div>
  );
};

export default Continue;