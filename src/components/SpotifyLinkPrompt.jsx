import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContextCore";
import { supabase } from "../supabaseClient";
import {
  authOptionsForProvider,
  clearPendingIdentityLink,
  dismissSpotifyPrompt,
  isSpotifyPromptDismissed,
  isSpotifyPromptSnoozed,
  providerLabel,
  rememberPendingIdentityLink,
  snoozeSpotifyPrompt,
} from "../utils/authProviders";
import "./SpotifyLinkPrompt.css";

const PROMPT_PROVIDERS = new Set(["kakao", "google"]);

function currentReturnPath(location) {
  return `${location.pathname}${location.search || ""}${location.hash || ""}`;
}

export default function SpotifyLinkPrompt() {
  const location = useLocation();
  const {
    session,
    user,
    currentProvider,
    linkedProviders,
    loading,
  } = useAuth();
  const authUserId = user?.authId || session?.user?.id || "";
  const promptKey = `${authUserId}:${currentProvider}`;
  const [hiddenPromptKey, setHiddenPromptKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorState, setErrorState] = useState({ key: "", message: "" });
  const errorMessage =
    errorState.key === promptKey ? errorState.message : "";

  const shouldShow = useMemo(() => {
    const hidden = hiddenPromptKey === promptKey;
    if (loading || !session || hidden) return false;
    if (
      location.pathname.startsWith("/auth/callback") ||
      location.pathname.startsWith("/login")
    ) {
      return false;
    }
    if (!PROMPT_PROVIDERS.has(currentProvider)) return false;
    if (linkedProviders?.has("spotify")) return false;
    if (isSpotifyPromptDismissed(authUserId)) return false;
    if (isSpotifyPromptSnoozed(authUserId)) return false;
    return true;
  }, [
    authUserId,
    currentProvider,
    hiddenPromptKey,
    linkedProviders,
    loading,
    location.pathname,
    promptKey,
    session,
  ]);

  if (!shouldShow) return null;

  const connectSpotify = async () => {
    if (busy) return;
    setBusy(true);
    setErrorState({ key: promptKey, message: "" });
    rememberPendingIdentityLink("spotify", currentReturnPath(location));

    const { error } = await supabase.auth.linkIdentity({
      provider: "spotify",
      options: authOptionsForProvider("spotify"),
    });

    if (error) {
      clearPendingIdentityLink();
      setBusy(false);
      setErrorState({
        key: promptKey,
        message: error.message || "Spotify 계정 연결을 시작하지 못했습니다.",
      });
    }
  };

  const handleLater = () => {
    snoozeSpotifyPrompt(authUserId);
    setHiddenPromptKey(promptKey);
  };

  const handleDismiss = () => {
    dismissSpotifyPrompt(authUserId);
    setHiddenPromptKey(promptKey);
  };

  return (
    <div className="spotify-link-prompt" role="presentation">
      <section
        className="spotify-link-prompt__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spotify-link-prompt-title"
      >
        <div className="spotify-link-prompt__mark" aria-hidden>
          <img src="/signup_spotify_light.svg" alt="" />
        </div>
        <div className="spotify-link-prompt__copy">
          <p className="spotify-link-prompt__eyebrow">
            {providerLabel(currentProvider)}로 로그인했어요
          </p>
          <h2 id="spotify-link-prompt-title">Spotify도 연결할까요?</h2>
          <p>
            Spotify가 연결되지 않으면 피드에서 음악이 재생되지 않을 수 있어요.
            지금 연결하거나, 나중에 마이페이지에서 연결할 수 있습니다.
          </p>
        </div>

        {errorMessage ? (
          <p className="spotify-link-prompt__error" role="status">
            {errorMessage}
          </p>
        ) : null}

        <div className="spotify-link-prompt__actions">
          <button
            type="button"
            className="spotify-link-prompt__primary"
            onClick={() => void connectSpotify()}
            disabled={busy}
          >
            {busy ? "연결 중..." : "Spotify 로그인"}
          </button>
          <button
            type="button"
            className="spotify-link-prompt__ghost"
            onClick={handleLater}
            disabled={busy}
          >
            나중에
          </button>
          <button
            type="button"
            className="spotify-link-prompt__text"
            onClick={handleDismiss}
            disabled={busy}
          >
            다시 보지 않기
          </button>
        </div>
      </section>
    </div>
  );
}
