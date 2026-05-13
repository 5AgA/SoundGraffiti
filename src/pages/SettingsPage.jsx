import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContextCore";
import {
  ACCOUNT_PROVIDERS,
  PROVIDER_INFO,
  authOptionsForProvider,
  clearPendingIdentityLink,
  getProviderIcon,
  identityEmail,
  providerLabel,
  rememberPendingIdentityLink,
} from "../utils/authProviders";
import "../components/CreatePost.css";
import "./MyPage.css";

function providerStatusText({ linked, current }) {
  if (current) return "현재 접속";
  if (!linked) return "미연결";
  return "연결됨";
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const {
    identities,
    linkedProviders,
    currentProvider,
    refreshAuthState,
  } = useAuth();

  const [accountBusy, setAccountBusy] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [accountError, setAccountError] = useState("");

  const accountRows = useMemo(
    () =>
      ACCOUNT_PROVIDERS.map((provider) => {
        const identity =
          identities?.find((item) => item?.provider === provider) ?? null;
        const linked = Boolean(linkedProviders?.has(provider));
        return {
          provider,
          identity,
          linked,
          current: currentProvider === provider,
          email: identityEmail(identity),
          info: PROVIDER_INFO[provider],
        };
      }),
    [currentProvider, identities, linkedProviders],
  );
  const linkedProviderCount = accountRows.filter((row) => row.linked).length;

  const linkProvider = async (provider) => {
    if (accountBusy) return;
    setAccountBusy(provider);
    setAccountError("");
    setAccountMessage("");
    rememberPendingIdentityLink(provider, "/mypage/settings");

    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: authOptionsForProvider(provider),
    });

    if (error) {
      clearPendingIdentityLink();
      setAccountBusy("");
      setAccountError(
        error.message ||
          `${providerLabel(provider)} 계정 연결을 시작하지 못했습니다.`,
      );
    }
  };

  const unlinkProvider = async (provider, identity) => {
    if (accountBusy || !identity) return;
    const ok = window.confirm(`${providerLabel(provider)} 연결을 해제할까요?`);
    if (!ok) return;

    setAccountBusy(provider);
    setAccountError("");
    setAccountMessage("");

    try {
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) {
        setAccountError(
          error.message ||
            `${providerLabel(provider)} 연결을 해제하지 못했습니다.`,
        );
        return;
      }
      await refreshAuthState();
      setAccountMessage(`${providerLabel(provider)} 연결을 해제했습니다.`);
    } finally {
      setAccountBusy("");
    }
  };

  return (
    <section className="upload-wrap" aria-label="설정">
      <div className="upload-phone">
        <div className="upload-scroll-area">
          <div className="upload-header">
            <h1 className="upload-title">SETTINGS</h1>
            <button
              type="button"
              className="upload-close-btn"
              onClick={() => navigate("/mypage")}
              disabled={Boolean(accountBusy)}
              aria-label="뒤로"
            >
              〈
            </button>
          </div>

          <section className="mypage-account" aria-label="소셜 계정 연결">
            <div className="mypage-account__header">
              <div>
                <h2>소셜 계정</h2>
                <p>
                  {currentProvider
                    ? `${providerLabel(currentProvider)}로 접속 중`
                    : "접속 provider를 확인하는 중"}
                </p>
              </div>
            </div>

            {accountError ? (
              <p className="mypage-account__notice mypage-account__notice--error">
                {accountError}
              </p>
            ) : null}
            {accountMessage ? (
              <p className="mypage-account__notice">{accountMessage}</p>
            ) : null}

            <div className="mypage-account__list">
              {accountRows.map((row) => {
                const busy = accountBusy === row.provider;
                const statusText = providerStatusText({
                  linked: row.linked,
                  current: row.current,
                });
                const canUnlink =
                  row.linked && !row.current && linkedProviderCount > 1;

                return (
                  <div className="mypage-account__row" key={row.provider}>
                    <img
                      className="mypage-account__icon"
                      src={getProviderIcon(row.provider)}
                      alt=""
                      width={32}
                      height={32}
                    />
                    <div className="mypage-account__body">
                      <div className="mypage-account__title-row">
                        <p className="mypage-account__name">
                          {row.info.koLabel}
                        </p>
                        <span
                          className={`mypage-account__status${
                            row.current
                              ? " mypage-account__status--current"
                              : ""
                          }`}
                        >
                          {statusText}
                        </span>
                      </div>
                      <p className="mypage-account__meta">
                        {row.linked
                          ? row.email || "연결 완료"
                          : "아직 연결되지 않았어요"}
                      </p>
                      <div className="mypage-account__actions">
                        {!row.linked ? (
                          <button
                            type="button"
                            onClick={() => void linkProvider(row.provider)}
                            disabled={Boolean(accountBusy)}
                          >
                            {busy ? "연결 중..." : "연결"}
                          </button>
                        ) : null}
                        {canUnlink ? (
                          <button
                            type="button"
                            className="mypage-account__unlink"
                            onClick={() =>
                              void unlinkProvider(row.provider, row.identity)
                            }
                            disabled={Boolean(accountBusy)}
                          >
                            {busy ? "해제 중..." : "해제"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
