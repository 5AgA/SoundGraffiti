import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { createSessionUser } from "../config/sessionUser";

const AuthContext = createContext(null);

function resolveAuthUser(session) {
  return createSessionUser(session?.user ?? null);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = {
    session,
    user: resolveAuthUser(session),
    spotifyToken: session?.provider_token ?? null,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      session: null,
      user: createSessionUser(null),
      spotifyToken: null,
      loading: false,
    };
  }
  return context;
}
