import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "../api/users";
import {
  fetchSpotifyAccessToken,
  spotifySessionToken,
  storeSpotifyTokensFromSession,
} from "../api/spotifyAuth";
import { supabase } from "../supabaseClient";
import { AuthContext } from "./AuthContextCore";
import {
  getPendingIdentityLink,
  getPendingOAuth,
  getSessionProvider,
  normalizeProvider,
  providerSetFromIdentities,
} from "../utils/authProviders";
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

function providerHintForSession(session) {
  const pendingLinkProvider = normalizeProvider(getPendingIdentityLink()?.provider);
  const pendingOAuthProvider = normalizeProvider(getPendingOAuth()?.provider);
  return pendingLinkProvider || pendingOAuthProvider || getSessionProvider(session);
}

function hasSpotifyIdentity(identities) {
  return providerSetFromIdentities(identities).has("spotify");
}

async function resolveSpotifyTokenInfo(session, identities) {
  const providerHint = providerHintForSession(session);

  if (providerHint === "spotify" && spotifySessionToken(session)) {
    try {
      return await storeSpotifyTokensFromSession(session);
    } catch (error) {
      console.warn("Failed to store Spotify token:", error?.message || error);
      return {
        accessToken: session.provider_token,
        expiresAt: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
        hasRefreshToken: Boolean(session.provider_refresh_token),
        error,
      };
    }
  }

  if (!hasSpotifyIdentity(identities)) return null;

  return await fetchSpotifyAccessToken();
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [identities, setIdentities] = useState([]);
  const [currentProvider, setCurrentProvider] = useState("");
  const [spotifyToken, setSpotifyToken] = useState(null);
  const [spotifyTokenExpiresAt, setSpotifyTokenExpiresAt] = useState("");
  const [spotifyAuthError, setSpotifyAuthError] = useState(null);
  const [spotifyAuthLoading, setSpotifyAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySpotifyTokenInfo = useCallback((tokenInfo) => {
    setSpotifyToken(tokenInfo?.accessToken || null);
    setSpotifyTokenExpiresAt(tokenInfo?.expiresAt || "");
    setSpotifyAuthError(tokenInfo?.error || null);
  }, []);

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
        const spotifyTokenInfo = await resolveSpotifyTokenInfo(
          nextSession,
          resolvedIdentities,
        ).catch((error) => {
          console.warn("Failed to resolve Spotify token:", error?.message || error);
          return { accessToken: "", expiresAt: "", error };
        });
        if (!isMounted()) return;

        setSession(nextSession);
        setUser(resolvedUser);
        setIdentities(resolvedIdentities);
        setCurrentProvider(getSessionProvider(nextSession));
        applySpotifyTokenInfo(spotifyTokenInfo);
        setAuthError(null);
      } catch (error) {
        if (!isMounted()) return;
        console.error("Failed to apply auth session:", error);
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setIdentities([]);
        setCurrentProvider(getSessionProvider(nextSession));
        applySpotifyTokenInfo(null);
        setAuthError(error);
      } finally {
        if (isMounted()) {
          setLoading(false);
        }
      }
    },
    [applySpotifyTokenInfo],
  );

  const refreshSpotifyToken = useCallback(
    async ({ forceRefresh = false } = {}) => {
      setSpotifyAuthLoading(true);
      try {
        const tokenInfo = await fetchSpotifyAccessToken({ forceRefresh });
        applySpotifyTokenInfo(tokenInfo);
        return tokenInfo?.accessToken || null;
      } catch (error) {
        console.warn("Failed to refresh Spotify token:", error?.message || error);
        applySpotifyTokenInfo({ accessToken: "", expiresAt: "", error });
        return null;
      } finally {
        setSpotifyAuthLoading(false);
      }
    },
    [applySpotifyTokenInfo],
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
        clearHomeFeedSessionCache();
      }
      void applySession(session, { isMounted });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applySession]);

  useEffect(() => {
    if (!spotifyToken || !spotifyTokenExpiresAt) return undefined;

    const expiresAtMs = new Date(spotifyTokenExpiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) return undefined;

    const refreshInMs = Math.max(30_000, expiresAtMs - Date.now() - 120_000);
    const timer = window.setTimeout(() => {
      void refreshSpotifyToken();
    }, refreshInMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshSpotifyToken, spotifyToken, spotifyTokenExpiresAt]);

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
      spotifyToken,
      spotifyTokenExpiresAt,
      spotifyAuthError,
      spotifyAuthLoading,
      loading,
      authError,
      refreshAuthState,
      refreshSpotifyToken,
    }),
    [
      session,
      user,
      identities,
      linkedProviders,
      currentProvider,
      spotifyToken,
      spotifyTokenExpiresAt,
      spotifyAuthError,
      spotifyAuthLoading,
      loading,
      authError,
      refreshAuthState,
      refreshSpotifyToken,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
