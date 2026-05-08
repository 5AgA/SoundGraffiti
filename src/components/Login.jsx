import { supabase } from '../supabaseClient'
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

export default function Login({ active = false }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const navigate = useNavigate();

    const handleEmailPasswordLogin = async (e) => {
        e.preventDefault();

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            alert("사용자가 존재하지 않거나 비밀번호가 틀렸습니다.");
            return;
        }

        navigate("/home");
    };

    const handleEnterSubmit = async (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        await handleEmailPasswordLogin(e);
    };

    const handleSpotifyLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'spotify',
            options: {
                scopes: 'user-read-email user-read-private streaming user-modify-playback-state user-read-playback-state',
                redirectTo: `${window.location.origin}/home`,
            },
        })
        if (error) {
            console.error('Spotify 로그인 실패:', error.message)
            alert('로그인에 실패했습니다: ' + error.message)
        }
    }

    const handleGoogleLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/home`,
            },
        })
        if (error) {
            console.error('Google 로그인 실패:', error.message)
            alert('로그인에 실패했습니다: ' + error.message)
        }
    }

    const handleKakaoLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'kakao',
            options: {
                redirectTo: `${window.location.origin}/home`,
            },
        })
        if (error) {
            console.error('Kakao 로그인 실패:', error.message)
            alert('로그인에 실패했습니다: ' + error.message)
        }
    }

    return (
      <section className="login-wrap">
        <div className="login-phone">
          <form className={`login-form${active ? " is-visible" : ""}`} onSubmit={handleEmailPasswordLogin}>
            <input
              className="login-input"
              placeholder="이메일을 입력하세요."
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleEnterSubmit}
              autoComplete="email"
            />
            <input
              className="login-input"
              placeholder="패스워드를 입력하세요."
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleEnterSubmit}
              autoComplete="current-password"
            />
          </form>

          <div className={`login-social${active ? " is-visible" : ""}`}>
            <div className="login-social-item">
              <button className="login-social-btn" onClick={handleKakaoLogin} type="button">
                <img className="login-social-icon" src="/signup_kakao_light.svg" alt="Kakao 로그인" />
              </button>
              <p className="login-social-label">KAKAO로
                <br />
                로그인
              </p>
            </div>

            <div className="login-social-item">
              <button className="login-social-btn" onClick={handleSpotifyLogin} type="button">
                <img className="login-social-icon" src="/signup_spotify_light.svg" alt="Spotify 로그인" />
              </button>
              <p className="login-social-label">Spotify로
                <br />
                로그인
              </p>
            </div>

            <div className="login-social-item">
              <button className="login-social-btn" onClick={handleGoogleLogin} type="button">
                <img className="login-social-icon" src="/signup_google_light.svg" alt="Google 로그인" />
              </button>
              <p className="login-social-label">Google로
                <br />
                로그인
              </p>
            </div>
          </div>

        </div>
      </section>
    )
}