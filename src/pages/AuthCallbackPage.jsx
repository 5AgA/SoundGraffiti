import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import {
  clearAllPendingAuth,
  normalizeProvider,
  providerLabel,
  resolvePendingAuthFlow,
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
const SESSION_CONFIRM_RETRY_DELAYS_MS = [0, 150, 400, 800, 1200, 2000];

/** React StrictMode 등으로 콜백 effect가 두 번 돌아도 code를 한 번만 교환 */
let oauthCodeExchangeCache = { code: null, promise: null };

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

async function waitForSession() {
  for (const delayMs of SESSION_CONFIRM_RETRY_DELAYS_MS) {
    await waitMs(delayMs);

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (session) return { session, error: null };
    if (error) return { session: null, error };
  }
  return { session: null, error: null };
}

async function ensureSessionFromOAuthCode(code) {
  const { data: { session: existing } } = await supabase.auth.getSession();
  if (existing) return { session: existing, error: null };

  if (oauthCodeExchangeCache.code === code && oauthCodeExchangeCache.promise) {
    return oauthCodeExchangeCache.promise;
  }

  oauthCodeExchangeCache = {
    code,
    promise: (async () => {
      const exchanged = await supabase.auth.exchangeCodeForSession(code);
      if (!exchanged.error) {
        const { data: { session } } = await supabase.auth.getSession();
        return { session: session ?? null, error: null };
      }

      const { data: { session: afterFail } } = await supabase.auth.getSession();
      if (afterFail) {
        return { session: afterFail, error: null };
      }

      return { session: null, error: exchanged.error };
    })(),
  };

  return oauthCodeExchangeCache.promise;
}

async function completeAuthCallback(flow) {
  if (flow.type === "link") {
    const linked = await waitForLinkedIdentity(flow.provider, () => false);
    if (!linked) {
      return {
        ok: false,
        code: "identity_link_missing",
        message: identityLinkMissingMessage(flow.provider),
      };
    }
  }

  return { ok: true, returnTo: flow.returnTo };
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

function linkErrorMessage(params, flow = resolvePendingAuthFlow()) {
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
  const finishedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function completeLogin() {
      const flow = resolvePendingAuthFlow();
      if (params.error || params.errorCode || params.errorDescription) {
        if (cancelled) return;
        setErrorInfo({
          code: params.errorCode || params.error || "oauth_error",
          message: linkErrorMessage(params, flow),
        });
        clearAllPendingAuth();
        return;
      }

      let session = null;
      let sessionError = null;

      if (params.code) {
        const result = await ensureSessionFromOAuthCode(params.code);
        session = result.session;
        sessionError = result.error;
      } else {
        const result = await waitForSession();
        session = result.session;
        sessionError = result.error;
      }

      if (!session) {
        if (cancelled) return;
        const provider = flow.provider;
        setErrorInfo({
          code: sessionError?.name || "missing_session",
          message:
            sessionError?.message ||
            (params.code
              ? `${providerLabel(provider)} 인증 정보를 연결하지 못했습니다.`
              : cleanMessage(params)),
        });
        clearAllPendingAuth();
        return;
      }

      const outcome = await completeAuthCallback(flow);
      if (!outcome.ok) {
        if (cancelled) return;
        setErrorInfo({
          code: outcome.code,
          message: outcome.message,
        });
        clearAllPendingAuth();
        return;
      }

      if (finishedRef.current) return;
      finishedRef.current = true;
      clearAllPendingAuth();
      navigate(outcome.returnTo, { replace: true });
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
