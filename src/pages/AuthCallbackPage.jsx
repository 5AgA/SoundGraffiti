import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
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

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [errorInfo, setErrorInfo] = useState(null);
  const params = useMemo(() => readOAuthParams(), []);

  useEffect(() => {
    let cancelled = false;

    async function completeLogin() {
      if (params.error || params.errorCode || params.errorDescription) {
        setErrorInfo({
          code: params.errorCode || params.error || "oauth_error",
          message: cleanMessage(params),
        });
        return;
      }

      if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(params.code);
        if (cancelled) return;

        if (error) {
          setErrorInfo({
            code: "session_exchange_failed",
            message: error.message || "로그인 세션을 만드는 데 실패했습니다.",
          });
          return;
        }

        navigate("/home", { replace: true });
        return;
      }

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session) {
        navigate("/home", { replace: true });
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
