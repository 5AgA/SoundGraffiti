import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import {
  clearPendingIdentityLink,
  clearPendingOAuth,
  getPendingIdentityLink,
  getPendingOAuth,
  normalizeProvider,
  providerLabel,
} from "../utils/authProviders";
import "./AuthCallbackPage.css";

function readOAuthParams() {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  const pick = (key) => search.get(key) || hash.get(key) || "";

  return {
    code: pick("code"),
    error: pick("error"),
    errorCode: pick("error_code"),
    errorDescription: pick("error_description"),
  };
}

function cleanMessage(params) {
  if (params.errorDescription) {
    return params.errorDescription.slice(0, 180);
  }

  if (params.error) {
    return "로그인 제공자에서 인증을 완료하지 못했습니다.";
  }

  return "로그인 세션을 확인하지 못했습니다.";
}

const LINK_CONFIRM_RETRY_DELAYS_MS = [0, 300, 800, 1500, 2500];

function waitMs(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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

function pendingFlow() {
  const link = getPendingIdentityLink();
  if (link) {
    return {
      type: "link",
      provider: normalizeProvider(link.provider),
      returnTo: safeReturnTo(link.returnTo),
    };
  }

  const oauth = getPendingOAuth();
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

function hasLinkedProvider(identities, provider) {
  const normalized = normalizeProvider(provider);
  if (!normalized) return false;
  return (Array.isArray(identities) ? identities : []).some(
    (identity) => normalizeProvider(identity?.provider) === normalized,
  );
}

async function waitForLinkedIdentity(provider, isCancelled) {
  for (const delayMs of LINK_CONFIRM_RETRY_DELAYS_MS) {
    await waitMs(delayMs);
    if (isCancelled()) return false;

    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) {
      console.warn("Failed to confirm linked identity:", error.message);
      continue;
    }

    if (hasLinkedProvider(data?.identities, provider)) return true;
  }

  return false;
}

function linkErrorMessage(params, flow = pendingFlow()) {
  const provider = flow.provider;
  if (params.errorCode === "identity_already_exists") {
    return `${providerLabel(provider)} 계정이 이미 연결되어 있거나 다른 계정에 연결되어 있습니다.`;
  }
  return cleanMessage(params);
}

function identityLinkMissingMessage(provider) {
  return `${providerLabel(provider)} 계정 연결이 완료되지 않았어요. 다시 시도해 주세요.`;
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [errorInfo, setErrorInfo] = useState(null);
  const params = useMemo(() => readOAuthParams(), []);

  useEffect(() => {
    let cancelled = false;

    async function completeLogin() {
      const flow = pendingFlow();
      if (params.error || params.errorCode || params.errorDescription) {
        setErrorInfo({
          code: params.errorCode || params.error || "oauth_error",
          message: linkErrorMessage(params, flow),
        });
        clearPendingIdentityLink();
        clearPendingOAuth();
        return;
      }

      if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          params.code,
        );
        if (cancelled) return;

        if (error) {
          const provider = flow.provider;
          setErrorInfo({
            code: "session_exchange_failed",
            message:
              error.message ||
              `${providerLabel(provider)} 인증 정보를 연결하지 못했습니다.`,
          });
          clearPendingIdentityLink();
          clearPendingOAuth();
          return;
        }

        if (flow.type === "link") {
          const linked = await waitForLinkedIdentity(
            flow.provider,
            () => cancelled,
          );
          if (cancelled) return;
          if (!linked) {
            setErrorInfo({
              code: "identity_link_missing",
              message: identityLinkMissingMessage(flow.provider),
            });
            clearPendingIdentityLink();
            clearPendingOAuth();
            return;
          }
        }

        const returnTo = flow.returnTo;
        clearPendingIdentityLink();
        clearPendingOAuth();
        navigate(returnTo, { replace: true });
        return;
      }

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session) {
        if (flow.type === "link") {
          const linked = await waitForLinkedIdentity(
            flow.provider,
            () => cancelled,
          );
          if (cancelled) return;
          if (!linked) {
            setErrorInfo({
              code: "identity_link_missing",
              message: identityLinkMissingMessage(flow.provider),
            });
            clearPendingIdentityLink();
            clearPendingOAuth();
            return;
          }
        }
        const returnTo = flow.returnTo;
        clearPendingIdentityLink();
        clearPendingOAuth();
        navigate(returnTo, { replace: true });
        return;
      }

      setErrorInfo({
        code: error?.name || "missing_session",
        message: error?.message || cleanMessage(params),
      });
    }

    void completeLogin();

    return () => {
      cancelled = true;
    };
  }, [navigate, params]);

  const goLogin = () => {
    navigate("/login", { replace: true });
  };

  return (
    <main className="auth-callback-screen">
      <section className="auth-callback-panel" aria-live="polite">
        {!errorInfo ? (
          <>
            <div className="auth-callback-spinner" aria-hidden="true" />
            <h1>로그인 확인 중</h1>
            <p>잠시만 기다려 주세요.</p>
          </>
        ) : (
          <>
            <h1>로그인이 완료되지 않았어요</h1>
            <p>{errorInfo.message}</p>
            <p className="auth-callback-code">code: {errorInfo.code}</p>
            <button type="button" onClick={goLogin}>
              다시 로그인하기
            </button>
          </>
        )}
      </section>
    </main>
  );
}
