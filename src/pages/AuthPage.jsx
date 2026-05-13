import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import LandingPage from "../components/LandingPage";
import Login from "../components/Login";
import { useAuth } from "../contexts/AuthContextCore";
import AuthCallbackPage from "./AuthCallbackPage";

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
  const { loading, session } = useAuth();
  const path = location.pathname;
  const [phase, setPhase] = useState(path === "/login" ? "login" : "landing");
  const isAuthRoute = path === "/" || path === "/login";
  const oauthParams = new URLSearchParams(
    `${location.search || ""}${location.hash ? `&${location.hash.replace(/^#/, "")}` : ""}`,
  );
  const hasOAuthCallbackParams =
    oauthParams.has("code") ||
    oauthParams.has("error") ||
    oauthParams.has("error_code") ||
    oauthParams.has("error_description");

  useEffect(() => {
    if (!isAuthRoute || hasOAuthCallbackParams) return;
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
  }, [hasOAuthCallbackParams, isAuthRoute, phase]);

  useEffect(() => {
    if (!isAuthRoute || hasOAuthCallbackParams) return;
    const nextPath = phase === "landing" ? "/" : "/login";
    if (path !== nextPath) {
      navigate(nextPath, { replace: true });
    }
  }, [hasOAuthCallbackParams, isAuthRoute, navigate, path, phase]);

  if (!loading && session) {
    return <Navigate to="/home" replace />;
  }

  if (hasOAuthCallbackParams) {
    return <AuthCallbackPage />;
  }

  return <AuthFlowScreen phase={phase} />;
}
