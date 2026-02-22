import { useNavigate } from "react-router-dom";
import "../styles/notfound.css"; 

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="not-found">
      <h1 className="error-code">404</h1>
      <p className="error-message">Oops! The page you're looking for doesn't exist.</p>
      <button className="home-button" onClick={() => navigate("/")}>
        Go Home
      </button>
    </div>
  );
};

export default NotFound;
