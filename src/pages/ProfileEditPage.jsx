import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Cropper from "react-easy-crop";
import {
  getUserById,
  updateUserProfile,
  uploadUserProfileImage,
} from "../api/users";
import { useAuth } from "../contexts/AuthContextCore";
import { supabase } from "../supabaseClient";
import { getCroppedImageFile } from "../utils/getCroppedImg";
import {
  DEFAULT_PROFILE_IMAGE,
  resolvedProfileImageUrl,
} from "../utils/profileImage";
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

  const fileInputRef = useRef(null);
  /** @type {React.MutableRefObject<import('react-easy-crop').Area | null>} */
  const croppedPixelsRef = useRef(null);
  const cropOriginalNameRef = useRef("");
  const [name, setName] = useState("");
  /** 서버에서 불러온 프로필 이미지 URL (원문) */
  const [storedProfileUrl, setStoredProfileUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState(
    /** @type {File | null} */ (null),
  );
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [useDefaultAvatar, setUseDefaultAvatar] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [cropSrc, setCropSrc] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropBusy, setCropBusy] = useState(false);
  const [cropPreparing, setCropPreparing] = useState(false);

  useEffect(() => {
    if (!selectedFile) {
      setLocalPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(selectedFile);
    setLocalPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedFile]);

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
      setStoredProfileUrl(
        typeof row.user_profile_url === "string" ? row.user_profile_url : "",
      );
      setSelectedFile(null);
      setUseDefaultAvatar(false);
      setInitialLoad(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, userId]);

  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  const closeCropModal = useCallback(() => {
    setCropSrc("");
    croppedPixelsRef.current = null;
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  }, []);

  const avatarDisplaySrc = useDefaultAvatar
    ? DEFAULT_PROFILE_IMAGE
    : localPreviewUrl || resolvedProfileImageUrl(storedProfileUrl);

  const onPickFile = useCallback(() => {
    setSaveError("");
    fileInputRef.current?.click();
  }, []);

  const openCropFromPreview = useCallback(async () => {
    if (busy || cropBusy || cropSrc || cropPreparing) return;
    setSaveError("");
    setCropPreparing(true);
    try {
      if (selectedFile) {
        cropOriginalNameRef.current = selectedFile.name || "profile";
        croppedPixelsRef.current = null;
        setZoom(1);
        setCrop({ x: 0, y: 0 });
        setCropSrc(URL.createObjectURL(selectedFile));
        return;
      }

      const sourceUrl =
        !useDefaultAvatar && storedProfileUrl.trim()
          ? resolvedProfileImageUrl(storedProfileUrl)
          : DEFAULT_PROFILE_IMAGE;

      const res = await fetch(sourceUrl, { mode: "cors" });
      if (!res.ok) {
        throw new Error("프로필 이미지를 불러오지 못했어요.");
      }
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error("이미지 형식이 아니에요.");
      }
      cropOriginalNameRef.current = "profile";
      croppedPixelsRef.current = null;
      setZoom(1);
      setCrop({ x: 0, y: 0 });
      setCropSrc(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      setSaveError(
        err instanceof Error
          ? err.message
          : "이미지를 불러오는 중 문제가 생겼어요.",
      );
    } finally {
      setCropPreparing(false);
    }
  }, [
    busy,
    cropBusy,
    cropSrc,
    cropPreparing,
    selectedFile,
    useDefaultAvatar,
    storedProfileUrl,
  ]);

  const onFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSaveError("");
    if (!file.type.startsWith("image/")) {
      setSaveError("이미지 파일만 선택할 수 있어요.");
      return;
    }
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setSaveError("5MB 이하 이미지를 선택해 주세요.");
      return;
    }
    cropOriginalNameRef.current = file.name || "profile";
    const url = URL.createObjectURL(file);
    croppedPixelsRef.current = null;
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    setCropSrc(url);
  }, []);

  const onCropComplete = useCallback((_area, pixels) => {
    croppedPixelsRef.current = pixels;
  }, []);

  const onCropApply = useCallback(async () => {
    if (!cropSrc) return;
    const pixels = croppedPixelsRef.current;
    if (!pixels?.width || !pixels?.height) {
      setSaveError("크롭 영역을 준비하는 중이에요. 잠시 후 다시 눌러 주세요.");
      return;
    }
    setCropBusy(true);
    setSaveError("");
    try {
      const file = await getCroppedImageFile(
        cropSrc,
        pixels,
        cropOriginalNameRef.current,
      );
      if (!file) {
        setSaveError("이미지를 만들지 못했어요.");
        return;
      }
      setUseDefaultAvatar(false);
      setSelectedFile(file);
      closeCropModal();
    } catch (err) {
      console.error(err);
      setSaveError(
        err instanceof Error ? err.message : "이미지 처리 중 문제가 생겼어요.",
      );
    } finally {
      setCropBusy(false);
    }
  }, [cropSrc, closeCropModal]);

  const onCropCancel = useCallback(() => {
    if (cropBusy) return;
    closeCropModal();
  }, [cropBusy, closeCropModal]);

  const onUseDefaultAvatar = useCallback(() => {
    setSaveError("");
    setSelectedFile(null);
    setUseDefaultAvatar(true);
  }, []);

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
      /** @type {string | null} */
      let profileUrlToSave;
      if (selectedFile) {
        const up = await uploadUserProfileImage(userId, selectedFile);
        if (!up.ok) {
          setSaveError(up.error);
          return;
        }
        profileUrlToSave = up.publicUrl;
      } else if (useDefaultAvatar) {
        profileUrlToSave = null;
      } else {
        profileUrlToSave = storedProfileUrl.trim() || null;
      }

      const res = await updateUserProfile(userId, {
        user_name: trimmedName,
        user_profile_url: profileUrlToSave,
      });
      if (!res.ok) {
        setSaveError(res.error);
        return;
      }
      const { error: metaErr } = await supabase.auth.updateUser({
        data: {
          user_name: trimmedName,
          user_profile_url: profileUrlToSave ?? undefined,
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
  }, [
    userId,
    name,
    selectedFile,
    useDefaultAvatar,
    storedProfileUrl,
    refreshAuthState,
    navigate,
  ]);

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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="profile-edit-file-input"
                aria-hidden
                tabIndex={-1}
                onChange={onFileChange}
              />
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
                <span className="profile-edit-label">프로필 사진</span>
                <div className="profile-edit-avatar-row">
                  <button
                    type="button"
                    className="profile-edit-avatar-preview-btn"
                    onClick={() => void openCropFromPreview()}
                    disabled={busy || !!cropSrc || cropPreparing}
                    aria-label="프로필 사진 위치·크기 조정"
                    aria-busy={cropPreparing}
                  >
                    <img
                      className="profile-edit-avatar-preview"
                      src={avatarDisplaySrc}
                      alt=""
                      width={88}
                      height={88}
                      draggable={false}
                    />
                  </button>
                  <div className="profile-edit-avatar-actions">
                    <button
                      type="button"
                      className="profile-edit-avatar-btn"
                      onClick={onPickFile}
                      disabled={busy}
                    >
                      사진 선택
                    </button>
                    <button
                      type="button"
                      className="profile-edit-avatar-btn profile-edit-avatar-btn--ghost"
                      onClick={onUseDefaultAvatar}
                      disabled={busy}
                    >
                      기본 이미지
                    </button>
                  </div>
                </div>
                <p className="profile-edit-hint">
                  왼쪽 사진을 누르면 위치·크기를 다시 맞출 수 있어요.
                  <br />
                  저장하면 클라우드에 올라가고 프로필에 반영돼요.
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

      {cropSrc ? (
        <div
          className="profile-crop-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-crop-title"
        >
          <div className="profile-crop-dialog">
            <p id="profile-crop-title" className="profile-crop-title">
              사진 위치·크기 조정
            </p>
            <p className="profile-crop-hint">
              드래그해서 위치를 맞추고, 아래 슬라이더로 확대·축소해 보세요.
            </p>
            <div className="profile-crop-stage">
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="profile-crop-zoom">
              <span className="profile-crop-zoom-label">확대</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.02}
                value={zoom}
                onChange={(ev) => setZoom(Number(ev.target.value))}
                aria-label="확대"
                disabled={cropBusy}
              />
            </div>
            <div className="profile-crop-actions">
              <button
                type="button"
                className="profile-crop-btn profile-crop-btn--ghost"
                onClick={onCropCancel}
                disabled={cropBusy || busy}
              >
                취소
              </button>
              <button
                type="button"
                className="profile-crop-btn profile-crop-btn--primary"
                onClick={() => void onCropApply()}
                disabled={cropBusy || busy}
              >
                {cropBusy ? "처리 중…" : "이 사진으로 적용"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
