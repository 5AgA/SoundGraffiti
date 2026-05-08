import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import LandingPage from "../components/LandingPage";
import Login from "../components/Login";

function AuthFlowScreen({ phase }) {
  return (
    <>
      <img
        className={`app-graffiti${
          phase === "landing" ? " at-landing" : ""
        }${phase === "moving" ? " to-login" : ""}${phase === "login" ? " at-login" : ""}`}
        src="/landing_dark.svg"
        alt=""
        aria-hidden
      />
      {phase !== "login" && <LandingPage moving={phase === "moving"} />}
      <div className={`app-login-layer${phase === "landing" ? "" : " is-visible"}`}>
        <Login active={phase !== "landing"} />
      </div>
    </>
  );
}

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const [phase, setPhase] = useState(path === "/login" ? "login" : "landing");
  const isAuthRoute = path === "/" || path === "/login";

  useEffect(() => {
    if (path === "/login") {
      setPhase("login");
      return;
    }
    if (path === "/") {
      setPhase("landing");
    }
  }, [path]);

  useEffect(() => {
    if (!isAuthRoute) return;
    if (phase === "login") return;

    const startMoveTimer = window.setTimeout(() => {
      setPhase("moving");
    }, 3000);

    const showLoginTimer = window.setTimeout(() => {
      setPhase("login");
    }, 5000);

    return () => {
      window.clearTimeout(startMoveTimer);
      window.clearTimeout(showLoginTimer);
    };
  }, [isAuthRoute, phase]);

  useEffect(() => {
    if (!isAuthRoute) return;
    const nextPath = phase === "landing" ? "/" : "/login";
    if (path !== nextPath) {
      navigate(nextPath);
    }
  }, [isAuthRoute, navigate, path, phase]);

  return <AuthFlowScreen phase={phase} />;
}
