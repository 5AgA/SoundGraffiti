import { useEffect, useState } from "react";
import { getCurrentUser } from "../api/users";
import { supabase } from "../supabaseClient";
import { AuthContext } from "./AuthContextCore";
import { clearHomeFeedSessionCache } from "../utils/homeFeedSessionCache";

function authDisplayName(authUser) {
  return (
    authUser?.user_metadata?.user_name ||
    authUser?.user_metadata?.full_name ||
    authUser?.user_metadata?.name ||
    authUser?.user_metadata?.preferred_username ||
    (typeof authUser?.email === "string" ? authUser.email.split("@")[0] : "")
  );
}

function authAvatarUrl(authUser) {
  return (
    authUser?.user_metadata?.avatar_url ||
    authUser?.user_metadata?.picture ||
    authUser?.user_metadata?.user_profile_url ||
    ""
  );
}

async function resolveSessionUser(session) {
  const authUser = session?.user ?? null;
  if (!authUser) return null;

  const appUser = await getCurrentUser();
  const appUserId = appUser?.user_id ?? null;

  return {
    ...authUser,
    authId: authUser.id,
    id: appUserId,
    appUserId,
    appUser,
    user_metadata: {
      ...authUser.user_metadata,
      user_name:
        appUser?.user_name ||
        authUser.user_metadata?.user_name ||
        authDisplayName(authUser),
      user_profile_url:
        appUser?.user_profile_url ||
        authUser.user_metadata?.user_profile_url ||
        authAvatarUrl(authUser),
    },
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const applySession = async (nextSession, { showLoading = false } = {}) => {
      if (showLoading) {
        setLoading(true);
      }
      const resolvedUser = await resolveSessionUser(nextSession);
      if (cancelled) return;
      setSession(nextSession);
      setUser(resolvedUser);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void applySession(session, { showLoading: true });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearHomeFeedSessionCache();
      }
      void applySession(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    session,
    user,
    spotifyToken: session?.provider_token ?? null,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
