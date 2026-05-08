import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import { AuthProvider } from "./contexts/AuthContext";
import { getFeed } from "./api/posts";
import Home from "./components/Home";
import LandingPage from "./components/LandingPage";
import Login from "./components/Login";
import Layout from "./components/Layout";

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

function HomeRouteScreen() {
  const [feed, setFeed] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const loadFeed = async () => {
      const data = await getFeed();
      if (!isMounted) return;
      setFeed(Array.isArray(data) ? data : []);
    };

    loadFeed();
    return () => {
      isMounted = false;
    };
  }, []);

  return <Home feed={feed} />;
}

function AppScreens() {
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

  return (
    <Layout fullContent>
      <Routes>
        <Route path="/home" element={<HomeRouteScreen />} />
        <Route path="/login" element={<AuthFlowScreen phase={phase} />} />
        <Route path="/" element={<AuthFlowScreen phase={phase} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppScreens />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
