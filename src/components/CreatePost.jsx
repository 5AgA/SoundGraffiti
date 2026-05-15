import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Cropper from "react-easy-crop";
import "./CreatePost.css";
import TrackSearch from "./TrackSearch";
import AIRecommend from "./AIRecommend";
import { supabase } from "../supabaseClient";
import { getCroppedImageFile } from "../utils/getCroppedImg";
import { useTrackPreviewAudio } from "../hooks/useTrackPreviewAudio";

const musicIcon = '/spotify.svg';
const mapIcon = '/map_pin.svg';
const aiIcon = "/AI.png";

const UPLOAD_SUCCESS_EVENT = "soundgraffiti-upload-success";
const UPLOAD_ERROR_EVENT = "soundgraffiti-upload-error";

/**
 * 업로드 화면이 언마운트된 뒤에도 동작하도록 모듈 스코프에서 실행.
 * @param {{ selectedPlace: object, selectedTrack: object, content: string, imageFile: File | null }} snapshot
 */
async function submitGraffitiFromSnapshot(snapshot) {
  const { selectedPlace, selectedTrack, content, imageFile } = snapshot;

  const { data: userData, error: userError } =
    await supabase.functions.invoke("get-current-user");

  if (userError || !userData?.user?.user_id) {
    throw new Error(
      "로그인된 사용자 정보를 불러오는 데 실패했습니다. 다시 로그인해 주세요.",
    );
  }

  const currentUserId = userData.user.user_id;

  const trackData = {
    trackId: selectedTrack.id,
    trackTitle: selectedTrack.name,
    artistName: selectedTrack.artists[0]?.name,
    albumName: selectedTrack.album?.name,
    albumImageUrl: selectedTrack.album?.images[0]?.url,
    durationMs: selectedTrack.duration_ms,
    previewUrl: selectedTrack.preview_url,
  };

  const { error: trackError } = await supabase.functions.invoke("save-track", {
    body: trackData,
  });

  if (trackError) {
    throw new Error("노래 정보를 데이터베이스에 등록하는 데 실패했습니다.");
  }

  let finalPlaceId = selectedPlace._fromMapDbPlaceId;

  if (finalPlaceId == null) {
    const placeData = {
      placeName: selectedPlace.place_name,
      address:
        selectedPlace.road_address_name || selectedPlace.address_name || "",
      latitude: parseFloat(selectedPlace.y),
      longitude: parseFloat(selectedPlace.x),
      externalPlaceId: String(selectedPlace.id),
    };

    const { data: placeRes, error: placeError } = await supabase.functions.invoke(
      "upsert-place",
      { body: placeData },
    );
    if (placeError) {
      throw new Error("장소 정보를 등록하는 데 실패했습니다.");
    }
    finalPlaceId = placeRes.place_id;
  }

  const postData = {
    userId: currentUserId,
    trackId: selectedTrack.id,
    placeId: finalPlaceId,
    content,
    previewStartMs: 0,
    previewEndMs: 30000,
  };

  const { data: createdPost, error: postError } = await supabase.functions.invoke(
    "create-post",
    { body: postData },
  );

  if (postError) throw postError;

  if (imageFile) {
    const postFolder = String(createdPost.post_id);
    const ext =
      imageFile.name?.toLowerCase().endsWith(".png") &&
      imageFile.type === "image/png"
        ? "png"
        : "jpg";
    const fileName = `${postFolder}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("post-media")
      .upload(fileName, imageFile, {
        contentType: imageFile.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      throw new Error("이미지 업로드에 실패했습니다.");
    }

    const { data: publicUrlData } = supabase.storage
      .from("post-media")
      .getPublicUrl(fileName);

    const uploadedMediaUrl = publicUrlData.publicUrl;

    const { error: mediaError } = await supabase.functions.invoke("save-media", {
      body: {
        postId: createdPost.post_id,
        mediaUrl: uploadedMediaUrl,
      },
    });

    if (mediaError) {
      throw new Error("사진 DB 등록에 실패했습니다.");
    }
  }

  return createdPost;
}

function UploadGraffiti() {
  const navigate = useNavigate();
  const location = useLocation();
  const mapPrefillAppliedRef = useRef(false);
  const [content, setContent] = useState('');
  
  // 바텀 시트 및 선택된 음악 상태 관리
  const [activeSheet, setActiveSheet] = useState(null);
  const [selectedTrack, setSelectedTrack] = useState(null);

  // 📸 사진 업로드 · 크롭
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  /** @type {React.MutableRefObject<import('react-easy-crop').Area | null>} */
  const croppedPixelsRef = useRef(null);
  const cropOriginalNameRef = useRef("");
  const [cropSrc, setCropSrc] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropBusy, setCropBusy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [sheetTranslateY, setSheetTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef(0);
  

  // 위치 및 장소 검색 관련 상태
  const [userLoc, setUserLoc] = useState(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [isVerifyingLoc, setIsVerifyingLoc] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef(null);

  const previewPost = useMemo(() => {
    if (!selectedTrack?.id) return null;
    const artistName =
      selectedTrack.artists
        ?.map((a) => a?.name)
        .filter(Boolean)
        .join(", ") || selectedTrack.artists?.[0]?.name || "";
    return {
      post_id: `create-preview-${selectedTrack.id}`,
      tracks: [
        {
          track_id: String(selectedTrack.id),
          track_title: selectedTrack.name,
          artist_name: artistName,
          preview_url: selectedTrack.preview_url || "",
          name: selectedTrack.name,
          artists: selectedTrack.artists,
          album: selectedTrack.album,
          duration_ms: selectedTrack.duration_ms,
        },
      ],
    };
  }, [selectedTrack]);

  const onPreviewUnavailable = useCallback(({ reason }) => {
    if (reason === "interaction_required") {
      alert("화면을 한 번 터치한 뒤 미리듣기 버튼을 다시 눌러 주세요.");
    } else if (reason === "preview_failed") {
      alert("미리듣기를 재생하지 못했어요.");
    }
  }, []);

  const { previewUnavailable, isPreviewPlaying, togglePreviewPlayback } =
    useTrackPreviewAudio(previewPost, { onUnavailable: onPreviewUnavailable });

  const handleSelectedTrackPreviewClick = (e) => {
    e.stopPropagation();
    if (previewUnavailable) {
      alert("미리듣기를 제공하지 않습니다.");
      return;
    }
    togglePreviewPlayback();
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => console.error("위치 권한 오류:", err),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  useEffect(() => {
    if (mapPrefillAppliedRef.current) return;
    const mp = location.state?.mapPrefillPlace;
    if (!mp?.place_name || mp.latitude == null || mp.longitude == null) {
      return;
    }
    mapPrefillAppliedRef.current = true;
    const ext = mp.external_place_id;
    const hasExt = ext != null && String(ext).trim() !== "";
    const next = {
      id: hasExt ? String(ext) : `sound-place-${mp.place_id ?? "map"}`,
      place_name: mp.place_name,
      y: String(mp.latitude),
      x: String(mp.longitude),
      road_address_name: mp.address || "",
      address_name: mp.address || "",
    };
    if (mp.place_id != null) next._fromMapDbPlaceId = mp.place_id;
    setSelectedPlace(next);
  }, [location.state]);

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

  const onCropComplete = useCallback((_area, pixels) => {
    croppedPixelsRef.current = pixels;
  }, []);

  const onCropApply = useCallback(async () => {
    if (!cropSrc) return;
    const pixels = croppedPixelsRef.current;
    if (!pixels?.width || !pixels?.height) {
      alert("크롭 영역을 준비하는 중입니다. 잠시 후 다시 눌러 주세요.");
      return;
    }
    setCropBusy(true);
    try {
      const POST_IMAGE_MAX_EDGE = 1920;
      const file = await getCroppedImageFile(
        cropSrc,
        pixels,
        cropOriginalNameRef.current || "graffiti",
        0.9,
        POST_IMAGE_MAX_EDGE,
      );
      if (!file) {
        alert("이미지를 만들지 못했습니다.");
        return;
      }
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      closeCropModal();
    } catch (err) {
      console.error(err);
      alert(
        err instanceof Error ? err.message : "이미지 처리 중 문제가 생겼습니다.",
      );
    } finally {
      setCropBusy(false);
    }
  }, [cropSrc, closeCropModal, imagePreview]);

  const onCropCancel = useCallback(() => {
    if (cropBusy) return;
    closeCropModal();
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }, [cropBusy, closeCropModal]);

  const openReCrop = useCallback(
    (e) => {
      e.stopPropagation();
      if (!imageFile || cropBusy || cropSrc) return;
      cropOriginalNameRef.current = imageFile.name || "graffiti";
      croppedPixelsRef.current = null;
      setZoom(1);
      setCrop({ x: 0, y: 0 });
      setCropSrc(URL.createObjectURL(imageFile));
    },
    [imageFile, cropBusy, cropSrc],
  );

  const handleMusicSearch = () => setActiveSheet('music');
  const handleAIRecommend = () => setActiveSheet('ai');
  const handlePlaceSearchOpen = () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    setSearchKeyword("");
    setActiveSheet("place");
  };
  
  const handleTrackSelect = (track) => {
    setSelectedTrack(track); 
    setActiveSheet(null); 
  };

  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 선택할 수 있습니다.");
      return;
    }
    const maxBytes = 12 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert("12MB 이하 이미지를 선택해 주세요.");
      return;
    }
    cropOriginalNameRef.current = file.name || "graffiti";
    croppedPixelsRef.current = null;
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(URL.createObjectURL(file));
  };

  const handleRemoveImage = (e) => {
    e.stopPropagation();
    closeCropModal();
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  };

  const onPointerDown = (e) => {
    setIsDragging(true);
    dragStartRef.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const dy = e.clientY - dragStartRef.current;
    if (dy > 0) setSheetTranslateY(dy); 
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (sheetTranslateY > 150) { 
      setActiveSheet(null);
    }
    setSheetTranslateY(0); 
  };

  useEffect(() => {
    if (!activeSheet) setSheetTranslateY(0);
  }, [activeSheet]);

  useEffect(() => {
    if (activeSheet !== "place") return undefined;
    if (!userLoc) {
      setSearchResults([]);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      setIsSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          "search-places",
          {
            body: { keyword: "", x: userLoc.lng, y: userLoc.lat },
          },
        );
        if (cancelled) return;
        if (error) throw error;
        setSearchResults(data?.results ?? []);
      } catch (err) {
        console.error("장소 검색 오류:", err);
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSheet, userLoc]);

  const handleSearchChange = (e) => {
    const keyword = e.target.value;
    setSearchKeyword(keyword);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    const trimmed = keyword.trim();
    if (!trimmed && !userLoc) {
      setSearchResults([]);
      return;
    }

    const delay = trimmed ? 300 : 200;

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSearching(true);
        const payload = { keyword: trimmed };
        if (userLoc) {
          payload.x = userLoc.lng;
          payload.y = userLoc.lat;
        }
        const { data, error } = await supabase.functions.invoke(
          "search-places",
          {
            body: payload,
          },
        );

        if (error) throw error;
        setSearchResults(data.results || []);
      } catch (err) {
        console.error("검색 오류:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, delay);
  };

  const handleSelectPlace = async (place) => {
    if (!userLoc) { alert("현재 위치를 확인하는 중입니다."); return; }
    try {
      setIsVerifyingLoc(true);
      const { data, error } = await supabase.functions.invoke('check-create-access', {
        body: {
          placeName: place.place_name, placeLatitude: parseFloat(place.y),
          placeLongitude: parseFloat(place.x), userLatitude: userLoc.lat, userLongitude: userLoc.lng
        }
      });
      if (error) throw error;
      if (data.is_accessible) {
        setSelectedPlace(place);
        setActiveSheet(null); 
        setSearchKeyword(''); 
        setSearchResults([]);
      } else {
        alert(data.message || "해당 장소 반경 200m 이내에서만 작성할 수 있습니다.");
      }
    } catch {
      alert("위치 검증에 실패했습니다.");
    } finally {
      setIsVerifyingLoc(false);
    }
  };

  const handleClearPlace = () => {
    setSelectedPlace(null);
  };

  const handleShare = () => {
    if (!selectedPlace) {
      alert("먼저 그래피티를 남길 장소를 검색하고 선택해주세요!");
      return;
    }
    if (!content) {
      alert("이 장소에 어울리는 한마디를 남겨보세요!");
      return;
    }
    if (!selectedTrack) {
      alert("스포티파이 버튼이나 AI 추천을 통해 배경음악을 골라주세요!");
      return;
    }

    setIsSubmitting(true);
    const snapshot = {
      selectedPlace: { ...selectedPlace },
      selectedTrack: { ...selectedTrack },
      content,
      imageFile,
    };

    navigate("/home");

    void (async () => {
      try {
        const created = await submitGraffitiFromSnapshot(snapshot);
        const postId =
          created?.post_id != null ? String(created.post_id) : null;
        window.dispatchEvent(
          new CustomEvent(UPLOAD_SUCCESS_EVENT, {
            detail: postId ? { postId } : {},
          }),
        );
      } catch (err) {
        console.error(err);
        window.dispatchEvent(new CustomEvent(UPLOAD_ERROR_EVENT));
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

return (
    <section className="upload-wrap">
      <div className="upload-phone">
        {/* 1. 상단 고정 헤더 */}
        <header className="upload-header">
          <h1 className="upload-title">UPLOAD MY GRAFFITI</h1>
          <button className="upload-close-btn" onClick={() => navigate(-1)} disabled={!!activeSheet || !!cropSrc}>〈</button>
        </header>

        {/* 🚨 2. 내부 스크롤이 발생하는 콘텐츠 영역 */}
        <div className="upload-inner">
          <div className="place-display-wrap">
            {selectedPlace ? (
              <div className="selected-place-box">
                <span className="place-name-text">
                  <img src={mapIcon} alt="위치 핀" className="place-icon" /> 
                  {selectedPlace.place_name}
                </span>
                <button className="place-clear-btn" onClick={handleClearPlace}>✕</button>
              </div>
            ) : (
              <button className="place-search-trigger" onClick={handlePlaceSearchOpen}>
                그래피티를 남길 장소를 검색하세요
              </button>
            )}
          </div>

          <div className="upload-btn-group">
            <button className="upload-dark-btn" onClick={handleMusicSearch}>
              <div className="btn-icon-circle"><img src={musicIcon} alt="" /></div>
              <span>Spotify로 음악 추가</span>
            </button>
            <button className="upload-dark-btn" onClick={handleAIRecommend}>
              <div className="btn-icon-circle"><img src={aiIcon} alt="" /></div>
              <span>AI로 음악 추천 받기</span>
            </button>
          </div>

          <div className="upload-image-area" onClick={handleImageUpload}>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={cameraInputRef}
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            {imagePreview ? (
              <>
                <img
                  src={imagePreview}
                  alt="첨부 미리보기"
                  className="upload-preview-img"
                />
                <div className="upload-image-actions">
                  <button
                    type="button"
                    className="upload-image-edit-btn"
                    onClick={openReCrop}
                    disabled={!!activeSheet || cropBusy || !!cropSrc}
                  >
                    편집
                  </button>
                  <button
                    type="button"
                    className="upload-image-edit-btn"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      cameraInputRef.current?.click();
                    }}
                    disabled={!!activeSheet || cropBusy || !!cropSrc}
                    aria-label="카메라로 다시 촬영"
                  >
                    촬영
                  </button>
                  <button
                    type="button"
                    className="image-remove-btn"
                    onClick={handleRemoveImage}
                  >
                    ✕
                  </button>
                </div>
              </>
            ) : (
              <>
                <img className="plus-icon" src="/plus.circle.png" alt="" />
                <p>이 공간의 이미지를 추가하세요</p>
                <p className="upload-image-hint">
                  선택 후 화면에서 위치·확대를 맞출 수 있어요.
                </p>
                <button
                  type="button"
                  className="upload-image-camera-btn"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    cameraInputRef.current?.click();
                  }}
                >
                  카메라로 찍기
                </button>
              </>
            )}
            {selectedTrack && (
              <div className="selected-track-overlay" onClick={(e) => e.stopPropagation()}>
                <img src={selectedTrack.album?.images[0]?.url || 'https://picsum.photos/50'} alt="album" className="selected-track-img" />
                <div className="selected-track-info">
                  <span className="selected-track-title">{selectedTrack.name}</span><span className="selected-track-artist">{selectedTrack.artists[0]?.name}</span>
                </div>
                <div className="selected-track-actions">
                  <button
                    type="button"
                    className="selected-track-preview-btn"
                    onClick={handleSelectedTrackPreviewClick}
                    aria-label={
                      previewUnavailable
                        ? "미리듣기 없음"
                        : isPreviewPlaying
                          ? "미리듣기 정지"
                          : "미리듣기 재생"
                    }
                  >
                    <img
                      className="selected-track-preview-icon"
                      src={
                        previewUnavailable
                          ? "/audio.off.png"
                          : isPreviewPlaying
                            ? "/audio.on.png"
                            : "/audio.off.png"
                      }
                      alt=""
                      aria-hidden
                    />
                  </button>
                  <button type="button" className="selected-track-remove" onClick={(e) => { e.stopPropagation(); setSelectedTrack(null); }}>✕</button>
                </div>
              </div>
            )}
          </div>

          <textarea className="upload-input-area" placeholder="이 장소에 어울리는 한마디를 남겨보세요." value={content} onChange={(e) => setContent(e.target.value)} />
        </div>

        {/* 🚨 3. 화면 하단에 무조건 고정되는 공유 버튼 영역 */}
        <div className="upload-bottom-fixed">
          <button 
            className="upload-share-btn" 
            onClick={handleShare}
            disabled={isSubmitting}
          >
            {isSubmitting ? "업로드 중..." : "공유"}
          </button>
        </div>

        {/* 바텀 시트 영역 */}
        <div className={`sheet-overlay ${activeSheet ? 'active' : ''}`} onClick={() => setActiveSheet(null)}></div>
        
        <div className={`bottom-sheet ${activeSheet ? 'active' : ''} ${isDragging ? 'dragging' : ''}`} style={{ transform: `translateY(${activeSheet ? sheetTranslateY + 'px' : '100%'})` }}>
          <div className="sheet-handle-zone" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <div className="sheet-handle"></div>
          </div>
          
          <div className="sheet-content-area">
            {activeSheet === 'music' && <TrackSearch onSelect={handleTrackSelect} />}
            {activeSheet === 'ai' && <AIRecommend onSelect={handleTrackSelect} />}
            
            {/* 바텀 시트 내부의 장소 검색 UI */}
            {activeSheet === 'place' && (
              <div className="place-sheet-wrap">
                <h2 className="place-sheet-title">장소 검색</h2>
                <div className="place-sheet-input-box">
                  <input 
                    type="text" 
                    className="place-search-input" 
                    placeholder="그래피티를 남길 장소를 검색하세요"
                    value={searchKeyword}
                    onChange={handleSearchChange}
                    disabled={isVerifyingLoc}

                  />
                  {(isSearching || isVerifyingLoc) && (
                    <span className="place-search-loading">
                      {isVerifyingLoc ? "위치 검증 중..." : "검색 중..."}
                    </span>
                  )}
                </div>
                
                <ul className="place-search-results">
                  {searchResults.map((place) => (
                    <li key={place.id} onClick={() => handleSelectPlace(place)}>
                      <div className="place-name-row">
                        <span className="place-name">{place.place_name}</span>
                        {place.category_group_name && (
                          <span className="place-category">{place.category_group_name}</span>
                        )}
                      </div>
                      {place.road_address_name && (
                        <div className="place-address">{place.road_address_name}</div>
                      )}
                      <div className="place-jibun">(지번) {place.address_name}</div>
                    </li>
                  ))}
                  {searchKeyword && searchResults.length === 0 && !isVerifyingLoc && !isSearching && (
                    <li className="place-no-result">검색 결과가 없습니다.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>

        {cropSrc ? (
          <div
            className="upload-crop-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-crop-title"
          >
            <div className="upload-crop-dialog">
              <p id="upload-crop-title" className="upload-crop-title">
                사진 위치·크기
              </p>
              <p className="upload-crop-hint">
                드래그해 위치를 맞추고, 슬라이더로 확대·축소할 수 있어요.
              </p>
              <div className="upload-crop-stage">
                <Cropper
                  image={cropSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={3 / 4}
                  cropShape="rect"
                  showGrid
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
              <div className="upload-crop-zoom">
                <span className="upload-crop-zoom-label">확대</span>
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
              <div className="upload-crop-actions">
                <button
                  type="button"
                  className="upload-crop-btn upload-crop-btn--ghost"
                  onClick={onCropCancel}
                  disabled={cropBusy}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="upload-crop-btn upload-crop-btn--primary"
                  onClick={() => void onCropApply()}
                  disabled={cropBusy}
                >
                  {cropBusy ? "처리 중…" : "적용"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default UploadGraffiti;