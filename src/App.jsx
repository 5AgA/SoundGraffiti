import { useEffect, useState } from "react";
import "./App.css";
import { AuthProvider } from "./contexts/AuthContext";
import LandingPage from "./components/LandingPage";
import Login from "./components/Login";
import Layout from "./components/Layout";

function App() {
  const [phase, setPhase] = useState("landing");

  useEffect(() => {
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
  }, []);

  return (
    <AuthProvider>
      <Layout fullContent>
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
      </Layout>
    </AuthProvider>
  );
}

export default App;
