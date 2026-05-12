export const AUTH_CALLBACK_PATH = "/auth/callback";

export const ACCOUNT_PROVIDERS = ["kakao", "spotify", "google"];

export const PROVIDER_INFO = {
  kakao: {
    label: "Kakao",
    koLabel: "카카오",
    icon: "/signup_kakao_light.svg",
  },
  spotify: {
    label: "Spotify",
    koLabel: "스포티파이",
    icon: "/signup_spotify_light.svg",
  },
  google: {
    label: "Google",
    koLabel: "구글",
    icon: "/signup_google_light.svg",
  },
};

export const SPOTIFY_AUTH_SCOPES =
  "user-read-email user-read-private streaming user-modify-playback-state user-read-playback-state";

const PENDING_OAUTH_KEY = "soundgraffiti.pendingOAuth";
const PENDING_LINK_KEY = "soundgraffiti.pendingIdentityLink";
const SPOTIFY_PROMPT_DISMISSED_PREFIX =
  "soundgraffiti.spotifyPromptDismissed.";
const SPOTIFY_PROMPT_SNOOZED_PREFIX = "soundgraffiti.spotifyPromptSnoozed.";

function canUseBrowserStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readStorageJson(storage, key) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStorageJson(storage, key, value) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private browsing modes.
  }
}

function removeStorageItem(storage, key) {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function localStore() {
  return canUseBrowserStorage() ? window.localStorage : null;
}

function sessionStore() {
  return typeof window !== "undefined" && window.sessionStorage
    ? window.sessionStorage
    : null;
}

export function getAuthRedirectUrl() {
  return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
}

export function normalizeProvider(provider) {
  const value = typeof provider === "string" ? provider.toLowerCase() : "";
  return ACCOUNT_PROVIDERS.includes(value) ? value : "";
}

export function providerLabel(provider) {
  return PROVIDER_INFO[normalizeProvider(provider)]?.koLabel || "소셜 계정";
}

export function getProviderIcon(provider) {
  return PROVIDER_INFO[normalizeProvider(provider)]?.icon || "";
}

export function getSessionProvider(session) {
  return normalizeProvider(
    session?.user?.app_metadata?.provider ||
      session?.user?.user_metadata?.provider ||
      "",
  );
}

export function identityEmail(identity) {
  return (
    identity?.identity_data?.email ||
    identity?.identity_data?.preferred_email ||
    identity?.email ||
    ""
  );
}

export function providerSetFromIdentities(identities) {
  return new Set(
    (Array.isArray(identities) ? identities : [])
      .map((identity) => normalizeProvider(identity?.provider))
      .filter(Boolean),
  );
}

function safeReturnTo(returnTo) {
  if (
    typeof returnTo !== "string" ||
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//")
  ) {
    return "/home";
  }
  if (returnTo.startsWith("/auth/callback") || returnTo.startsWith("/login")) {
    return "/home";
  }
  return returnTo;
}

function rememberPendingFlow(key, provider, returnTo) {
  const normalized = normalizeProvider(provider);
  if (!normalized) return;
  writeStorageJson(localStore(), key, {
    provider: normalized,
    returnTo: safeReturnTo(returnTo),
    createdAt: Date.now(),
  });
}

export function rememberPendingOAuth(provider, returnTo = "/home") {
  rememberPendingFlow(PENDING_OAUTH_KEY, provider, returnTo);
}

export function getPendingOAuth() {
  return readStorageJson(localStore(), PENDING_OAUTH_KEY);
}

export function clearPendingOAuth() {
  removeStorageItem(localStore(), PENDING_OAUTH_KEY);
}

export function rememberPendingIdentityLink(provider, returnTo = "/home") {
  rememberPendingFlow(PENDING_LINK_KEY, provider, returnTo);
}

export function getPendingIdentityLink() {
  return readStorageJson(localStore(), PENDING_LINK_KEY);
}

export function clearPendingIdentityLink() {
  removeStorageItem(localStore(), PENDING_LINK_KEY);
}

export function authOptionsForProvider(provider) {
  const options = {
    redirectTo: getAuthRedirectUrl(),
  };

  if (normalizeProvider(provider) === "spotify") {
    options.scopes = SPOTIFY_AUTH_SCOPES;
  }

  return options;
}

function spotifyPromptKey(authUserId, prefix) {
  return `${prefix}${authUserId}`;
}

export function isSpotifyPromptDismissed(authUserId) {
  if (!authUserId) return false;
  return localStore()?.getItem(
    spotifyPromptKey(authUserId, SPOTIFY_PROMPT_DISMISSED_PREFIX),
  ) === "1";
}

export function dismissSpotifyPrompt(authUserId) {
  if (!authUserId) return;
  localStore()?.setItem(
    spotifyPromptKey(authUserId, SPOTIFY_PROMPT_DISMISSED_PREFIX),
    "1",
  );
}

export function isSpotifyPromptSnoozed(authUserId) {
  if (!authUserId) return false;
  return sessionStore()?.getItem(
    spotifyPromptKey(authUserId, SPOTIFY_PROMPT_SNOOZED_PREFIX),
  ) === "1";
}

export function snoozeSpotifyPrompt(authUserId) {
  if (!authUserId) return;
  sessionStore()?.setItem(
    spotifyPromptKey(authUserId, SPOTIFY_PROMPT_SNOOZED_PREFIX),
    "1",
  );
}
