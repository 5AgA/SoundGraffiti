import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUserById, updateUserProfile } from "../api/users";
import { useAuth } from "../contexts/AuthContextCore";
import { supabase } from "../supabaseClient";
import { clearMyPageSessionCache } from "../utils/myPageSessionCache";
import "../components/CreatePost.css";
import "./ProfileEditPage.css";

export default function ProfileEditPage() {
  const navigate = useNavigate();
  const { user, refreshAuthState, loading: authLoading } = useAuth();
  const userId =
    user?.id != null && Number.isFinite(Number(user.id))
      ? Number(user.id)
      : null;

  const [name, setName] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (userId == null) {
      setLoadError("로그인 정보를 확인할 수 없어요.");
      setInitialLoad(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const row = await getUserById(userId);
      if (cancelled) return;
      if (!row) {
        setLoadError("프로필을 불러오지 못했어요.");
        setInitialLoad(false);
        return;
      }
      setName(typeof row.user_name === "string" ? row.user_name : "");
      setProfileUrl(
        typeof row.user_profile_url === "string" ? row.user_profile_url : "",
      );
      setInitialLoad(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, userId]);

  const onSave = useCallback(async () => {
    if (userId == null) return;
    setSaveError("");
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSaveError("이름을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await updateUserProfile(userId, {
        user_name: trimmedName,
        user_profile_url: profileUrl.trim() || null,
      });
      if (!res.ok) {
        setSaveError(res.error);
        return;
      }
      const { error: metaErr } = await supabase.auth.updateUser({
        data: {
          user_name: trimmedName,
          user_profile_url: profileUrl.trim() || undefined,
        },
      });
      if (metaErr) {
        console.warn("auth.updateUser (profile):", metaErr.message);
      }
      await refreshAuthState();
      clearMyPageSessionCache();
      navigate("/mypage", { replace: true });
    } catch (e) {
      console.error(e);
      setSaveError("저장 중 문제가 생겼어요.");
    } finally {
      setBusy(false);
    }
  }, [userId, name, profileUrl, refreshAuthState, navigate]);

  return (
    <section className="upload-wrap" aria-label="프로필 수정">
      <div className="upload-phone">
        <div className="upload-scroll-area">
          <div className="upload-header">
            <h1 className="upload-title">MY PROFILE</h1>
            <button
              type="button"
              className="upload-close-btn"
              onClick={() => navigate(-1)}
              disabled={busy}
              aria-label="뒤로"
            >
              〈
            </button>
          </div>

          {loadError ? (
            <p className="profile-edit-error" role="status">
              {loadError}
            </p>
          ) : null}

          {!initialLoad && !loadError ? (
            <div className="profile-edit-card">
              <div className="profile-edit-field">
                <label className="profile-edit-label" htmlFor="pe-name">
                  이름
                </label>
                <input
                  id="pe-name"
                  className="profile-edit-input"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                />
              </div>
              <div className="profile-edit-field">
                <label className="profile-edit-label" htmlFor="pe-url">
                  프로필 이미지 URL
                </label>
                <input
                  id="pe-url"
                  className="profile-edit-input"
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  value={profileUrl}
                  onChange={(e) => setProfileUrl(e.target.value)}
                  maxLength={2000}
                />
                <p className="profile-edit-hint">
                  이미지 주소를 넣으면 마이페이지·피드에 반영돼요. 비우면 기본
                  이미지를 씁니다.
                </p>
              </div>
              {saveError ? (
                <p className="profile-edit-error" role="status">
                  {saveError}
                </p>
              ) : null}
              <div className="profile-edit-actions">
                <button
                  type="button"
                  className="profile-edit-save"
                  onClick={() => void onSave()}
                  disabled={busy}
                >
                  {busy ? "저장 중…" : "저장"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
