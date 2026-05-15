export const AUTH_CALLBACK_PATH = "/auth/callback";

export const ACCOUNT_PROVIDERS = ["kakao", "google"];

export const PROVIDER_INFO = {
  kakao: {
    label: "Kakao",
    koLabel: "카카오",
    icon: "/signup_kakao_light.svg",
  },
  google: {
    label: "Google",
    koLabel: "구글",
    icon: "/signup_google_light.svg",
  },
};

const PENDING_OAUTH_KEY = "soundgraffiti.pendingOAuth";
const PENDING_LINK_KEY = "soundgraffiti.pendingIdentityLink";

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
  clearPendingIdentityLink();
  rememberPendingFlow(PENDING_OAUTH_KEY, provider, returnTo);
}

export function getPendingOAuth() {
  return readStorageJson(localStore(), PENDING_OAUTH_KEY);
}

export function clearPendingOAuth() {
  removeStorageItem(localStore(), PENDING_OAUTH_KEY);
}

export function rememberPendingIdentityLink(provider, returnTo = "/home") {
  clearPendingOAuth();
  rememberPendingFlow(PENDING_LINK_KEY, provider, returnTo);
}

export function getPendingIdentityLink() {
  return readStorageJson(localStore(), PENDING_LINK_KEY);
}

export function clearPendingIdentityLink() {
  removeStorageItem(localStore(), PENDING_LINK_KEY);
}

export function clearAllPendingAuth() {
  clearPendingOAuth();
  clearPendingIdentityLink();
}

/** @returns {{ type: "oauth" | "link" | "", provider: string, returnTo: string }} */
export function resolvePendingAuthFlow() {
  const link = getPendingIdentityLink();
  const oauth = getPendingOAuth();
  const linkAt = Number(link?.createdAt) || 0;
  const oauthAt = Number(oauth?.createdAt) || 0;

  if (link && oauth) {
    const newer = oauthAt >= linkAt ? oauth : link;
    const type = oauthAt >= linkAt ? "oauth" : "link";
    return {
      type,
      provider: normalizeProvider(newer.provider),
      returnTo: safeReturnTo(newer.returnTo),
    };
  }

  if (link) {
    return {
      type: "link",
      provider: normalizeProvider(link.provider),
      returnTo: safeReturnTo(link.returnTo),
    };
  }

  if (oauth) {
    return {
      type: "oauth",
      provider: normalizeProvider(oauth.provider),
      returnTo: safeReturnTo(oauth.returnTo),
    };
  }

  return {
    type: "",
    provider: "",
    returnTo: "/home",
  };
}

export function authOptionsForProvider() {
  return {
    redirectTo: getAuthRedirectUrl(),
  };
}
