import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./contexts/AuthContextCore";
import Layout from "./components/Layout";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import MapPage from "./pages/MapPage";
import MyPage from "./pages/MyPage";
import UploadGraffiti from "./components/CreatePost";

function ProtectedRoute({ children }) {
  const { loading, session } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout fullContent>
          <Routes>
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/map"
              element={
                <ProtectedRoute>
                  <MapPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mypage"
              element={
                <ProtectedRoute>
                  <MyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/upload"
              element={
                <ProtectedRoute>
                  <UploadGraffiti />
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/" element={<AuthPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
