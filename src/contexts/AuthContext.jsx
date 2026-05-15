import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "../api/users";
import { supabase } from "../supabaseClient";
import { AuthContext } from "./AuthContextCore";
import {
  clearAllPendingAuth,
  getSessionProvider,
  providerSetFromIdentities,
} from "../utils/authProviders";
import { clearHomeFeedSessionCache } from "../utils/homeFeedSessionCache";
import { clearMapSessionCache } from "../utils/mapSessionCache";
import { profileUrlRawFromUsersRow } from "../utils/profileImage";

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
        profileUrlRawFromUsersRow(appUser) ?? authAvatarUrl(authUser),
    },
  };
}

async function resolveIdentities(session) {
  const fallback = Array.isArray(session?.user?.identities)
    ? session.user.identities
    : [];

  if (!session?.user) return [];

  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) {
    console.warn("Failed to load linked identities:", error.message);
    return fallback;
  }

  return data?.identities ?? fallback;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [identities, setIdentities] = useState([]);
  const [currentProvider, setCurrentProvider] = useState("");
  const [authError, setAuthError] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback(
    async (nextSession, { showLoading = false, isMounted = () => true } = {}) => {
      if (showLoading) {
        setLoading(true);
      }

      try {
        const [resolvedUser, resolvedIdentities] = await Promise.all([
          resolveSessionUser(nextSession),
          resolveIdentities(nextSession),
        ]);
        if (!isMounted()) return;

        setSession(nextSession);
        setUser(resolvedUser);
        setIdentities(resolvedIdentities);
        setCurrentProvider(getSessionProvider(nextSession));
        setAuthError(null);
      } catch (error) {
        if (!isMounted()) return;
        console.error("Failed to apply auth session:", error);
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setIdentities([]);
        setCurrentProvider(getSessionProvider(nextSession));
        setAuthError(error);
      } finally {
        if (isMounted()) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const refreshAuthState = useCallback(async () => {
    const {
      data: { session: nextSession },
      error,
    } = await supabase.auth.getSession();
    if (error) throw error;
    await applySession(nextSession);
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;
    const isMounted = () => !cancelled;

    supabase.auth.getSession().then(({ data: { session } }) => {
      void applySession(session, { showLoading: true, isMounted });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearAllPendingAuth();
        clearHomeFeedSessionCache();
        clearMapSessionCache();
      }
      void applySession(session, { isMounted });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const linkedProviders = useMemo(
    () => providerSetFromIdentities(identities),
    [identities],
  );

  const value = useMemo(
    () => ({
      session,
      user,
      identities,
      linkedProviders,
      currentProvider,
      loading,
      authError,
      refreshAuthState,
    }),
    [
      session,
      user,
      identities,
      linkedProviders,
      currentProvider,
      loading,
      authError,
      refreshAuthState,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
