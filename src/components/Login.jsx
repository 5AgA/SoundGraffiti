import { useState } from "react";
import { supabase } from "../supabaseClient";
import "./Login.css";

const AUTH_CALLBACK_PATH = "/auth/callback";
const getRedirectUrl = () => `${window.location.origin}${AUTH_CALLBACK_PATH}`;

export default function Login({ active = false }) {
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOAuthLogin = async (provider) => {
    setErrorMessage("");
    setIsSubmitting(true);

    const options = {
      redirectTo: getRedirectUrl(),
    };

    if (provider === "spotify") {
      options.scopes =
        "user-read-email user-read-private streaming user-modify-playback-state user-read-playback-state";
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options,
    });

    setIsSubmitting(false);

    if (error) {
      console.error(`${provider} login failed:`, error.message);
      setErrorMessage("로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <section className="login-wrap">
      <div className="login-phone">
        <div className={`login-social${active ? " is-visible" : ""}`}>
          <div className="login-social-item">
            <button
              className="login-social-btn"
              onClick={() => handleOAuthLogin("kakao")}
              type="button"
              disabled={isSubmitting}
            >
              <img
                className="login-social-icon"
                src="/signup_kakao_light.svg"
                alt="Kakao 로그인"
              />
            </button>
            <p className="login-social-label">
              KAKAO로
              <br />
              로그인
            </p>
          </div>

          <div className="login-social-item">
            <button
              className="login-social-btn"
              onClick={() => handleOAuthLogin("spotify")}
              type="button"
              disabled={isSubmitting}
            >
              <img
                className="login-social-icon"
                src="/signup_spotify_light.svg"
                alt="Spotify 로그인"
              />
            </button>
            <p className="login-social-label">
              Spotify로
              <br />
              로그인
            </p>
          </div>

          <div className="login-social-item">
            <button
              className="login-social-btn"
              onClick={() => handleOAuthLogin("google")}
              type="button"
              disabled={isSubmitting}
            >
              <img
                className="login-social-icon"
                src="/signup_google_light.svg"
                alt="Google 로그인"
              />
            </button>
            <p className="login-social-label">
              Google로
              <br />
              로그인
            </p>
          </div>
        </div>

        {errorMessage && (
          <p className={`login-error${active ? " is-visible" : ""}`}>
            {errorMessage}
          </p>
        )}
      </div>
    </section>
  );
}
