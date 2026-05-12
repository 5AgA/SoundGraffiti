import { supabase } from "../supabaseClient";
import { SPOTIFY_AUTH_SCOPES } from "../utils/authProviders";

async function readFunctionError(error) {
  const response = error?.context;
  if (!response || typeof response.clone !== "function") {
    return {
      message: error?.message || "Spotify 인증 정보를 처리하지 못했습니다.",
      code: "",
      status: 0,
    };
  }

  try {
    const body = await response.clone().json();
    return {
      message:
        body?.error || error?.message || "Spotify 인증 정보를 처리하지 못했습니다.",
      code: body?.code || "",
      status: response.status || 0,
    };
  } catch {
    return {
      message: error?.message || "Spotify 인증 정보를 처리하지 못했습니다.",
      code: "",
      status: response.status || 0,
    };
  }
}

async function invokeSpotifyToken(body) {
  const { data, error } = await supabase.functions.invoke("spotify-token", {
    body,
  });

  if (error) {
    throw await readFunctionError(error);
  }

  if (data?.error) {
    throw {
      message: data.error,
      code: data.code || "",
      status: 0,
    };
  }

  return data;
}

export function spotifySessionToken(session) {
  const accessToken = session?.provider_token;
  if (typeof accessToken !== "string" || !accessToken) return null;

  return {
    accessToken,
    refreshToken:
      typeof session?.provider_refresh_token === "string"
        ? session.provider_refresh_token
        : "",
  };
}

export async function storeSpotifyTokensFromSession(session) {
  const token = spotifySessionToken(session);
  if (!token) return null;

  const data = await invokeSpotifyToken({
    action: "store",
    providerAccessToken: token.accessToken,
    providerRefreshToken: token.refreshToken,
    scopes: SPOTIFY_AUTH_SCOPES,
  });

  return {
    accessToken: data?.accessToken || token.accessToken,
    expiresAt: data?.expiresAt || "",
    hasRefreshToken: Boolean(data?.hasRefreshToken),
  };
}

export async function fetchSpotifyAccessToken({ forceRefresh = false } = {}) {
  const data = await invokeSpotifyToken({
    action: "get",
    forceRefresh,
  });

  return {
    accessToken: data?.accessToken || "",
    expiresAt: data?.expiresAt || "",
    hasRefreshToken: Boolean(data?.hasRefreshToken),
  };
}

export async function deleteStoredSpotifyTokens() {
  await invokeSpotifyToken({ action: "delete" });
}
