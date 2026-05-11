import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './CreatePost.css';
import spotifyIcon from '../../public/spotify.svg';
import mapIcon from '../../public/map_pin.svg';
import aiIcon from '../../public/AI.svg';
import TrackSearch from './TrackSearch';
import AIRecommend from './AIRecommend';
import { supabase } from '../supabaseClient'; 

function UploadGraffiti({ onGoToHome }) {
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // 바텀 시트 및 선택된 음악 상태 관리
  const [activeSheet, setActiveSheet] = useState(null);
  const [selectedTrack, setSelectedTrack] = useState(null);

  // 📸 사진 업로드 관련 상태 및 Ref
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);

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

  const handleSpotifyAdd = () => setActiveSheet('spotify');
  const handleAIRecommend = () => setActiveSheet('ai');
  const handlePlaceSearchOpen = () => setActiveSheet('place');
  
  const handleTrackSelect = (track) => {
    setSelectedTrack(track); 
    setActiveSheet(null); 
  };

  // 이미지 추가 영역 클릭 시 숨겨진 input 강제 클릭 (갤러리 오픈)
  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  // 갤러리에서 사진을 선택했을 때 실행되는 함수 (미리보기 생성)
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file)); 
    }
  };

  const handleRemoveImage = (e) => {
    e.stopPropagation(); 
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; 
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
    if (dy > 0) setSheetTranslateY(dy); // 아래로만 드래그 허용
  };

  const onPointerUp = (e) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (sheetTranslateY > 150) { // 150px 이상 드래그하면 닫기
      setActiveSheet(null);
    }
    setSheetTranslateY(0); // 위치 초기화
  };

  useEffect(() => {
    if (!activeSheet) setSheetTranslateY(0);
  }, [activeSheet]);

  // 카카오 장소 검색
  const handleSearchChange = (e) => {
    const keyword = e.target.value;
    setSearchKeyword(keyword);
    
    // 타이핑 중이면 이전 요청 취소 (디바운스)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    if (!keyword.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    // 타이핑 멈추고 0.3초 뒤에 검색 API 호출
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const payload = { keyword };
        if (userLoc) {
          payload.x = userLoc.lng;
          payload.y = userLoc.lat;
        }
        const { data, error } = await supabase.functions.invoke('search-places', {
          body: payload
        });

        if (error) throw error;
        setSearchResults(data.results || []);
      } catch (err) {
        console.error("검색 오류:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300); 
  };

  // 장소 선택 시 200m 이내 검증 (엣지 펑션 호출)
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
        setActiveSheet(null); // 💡 검증 성공 시 시트 닫기
        setSearchKeyword(''); // 다음을 위해 검색어 초기화
        setSearchResults([]);
      } else {
        alert(data.message || "해당 장소 반경 200m 이내에서만 작성할 수 있습니다.");
      }
    } catch (err) {
      alert("위치 검증에 실패했습니다.");
    } finally {
      setIsVerifyingLoc(false);
    }
  };

  const handleClearPlace = () => {
    setSelectedPlace(null);
  };

  const handleShare = async () => {
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
    
    try {
      setIsLoading(true);

      const { data: userData, error: userError } = await supabase.functions.invoke('get-current-user');
      
      if (userError || !userData?.user?.user_id) {
        throw new Error("로그인된 사용자 정보를 불러오는 데 실패했습니다. 다시 로그인해 주세요.");
      }

      const currentUserId = userData.user.user_id;

      // ==========================================
      // 1️⃣ 노래 정보 먼저 DB에 저장 (save-track)
      // ==========================================
      const trackData = {
        trackId: selectedTrack.id,
        trackTitle: selectedTrack.name,
        artistName: selectedTrack.artists[0]?.name,
        albumName: selectedTrack.album?.name,
        albumImageUrl: selectedTrack.album?.images[0]?.url,
        durationMs: selectedTrack.duration_ms,
        previewUrl: selectedTrack.preview_url
      };

      const { error: trackError } = await supabase.functions.invoke('save-track', {
        body: trackData
      });

      if (trackError) throw new Error("노래 정보를 데이터베이스에 등록하는 데 실패했습니다.");

      const placeData = {
        placeName: selectedPlace.place_name,
        // 도로명 주소가 없으면 지번 주소 사용
        address: selectedPlace.road_address_name || selectedPlace.address_name || '',
        latitude: parseFloat(selectedPlace.y),
        longitude: parseFloat(selectedPlace.x),
        externalPlaceId: String(selectedPlace.id) // 카카오 고유 ID
      };

      const { data: placeRes, error: placeError } = await supabase.functions.invoke('upsert-place', { body: placeData });
      if (placeError) throw new Error("장소 정보를 등록하는 데 실패했습니다.");

      
      const finalPlaceId = placeRes.place_id; // 🎯 우리 DB의 깔끔한 int8 place_id 획득!
      // ==========================================
      // 2️⃣ 게시글(Post) DB에 저장 (create-post)
      // ==========================================
      const postData = {
        userId: currentUserId, 
        trackId: selectedTrack.id, 
        placeId: finalPlaceId,
        content: content,
        previewStartMs: 0,        
        previewEndMs: 30000
      };

      // 새로 쓴 글의 정보(data)를 반환받음! (여기에 post_id가 들어있음)
      const { data: createdPost, error: postError } = await supabase.functions.invoke('create-post', {
        body: postData
      });

      if (postError) throw postError;

      // ==========================================
      // 3️⃣ 사진이 있다면 스토리지에 올리고, 사진 DB 저장 (save-media)
      // ==========================================
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`; // 중복 방지용 시간값 이름
        
        // Storage(graffiti-media 버킷)에 업로드
        const { error: uploadError } = await supabase.storage
          .from('post-media')
          .upload(fileName, imageFile);

        if (uploadError) throw new Error("이미지 업로드에 실패했습니다.");

        // 방금 올린 사진의 퍼블릭 URL 가져오기
        const { data: publicUrlData } = supabase.storage
          .from('post-media')
          .getPublicUrl(fileName);

        const uploadedMediaUrl = publicUrlData.publicUrl;

        // 새 엣지 펑션(save-media) 호출해서 PostMedia 테이블에 저장
        const { error: mediaError } = await supabase.functions.invoke('save-media', {
          body: {
            postId: createdPost.post_id, // 2번 과정에서 만든 게시글의 ID
            mediaUrl: uploadedMediaUrl
          }
        });

        if (mediaError) throw new Error("사진 DB 등록에 실패했습니다.");
      }

      alert("그래피티가 성공적으로 기록되었습니다!"); // 💡 이제 확실히 뜰 거야
      navigate('/home'); // 💡 홈 화면으로 강제 이동

    } catch (err) {
      console.error(err);
      alert(`업로드 실패: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

return (
    <section className="upload-wrap">
      <div className="upload-phone">
        <div className="upload-scroll-area">
          <div className="upload-header">
            <h1 className="upload-title">UPLOAD MY GRAFFITI</h1>
            <button className="upload-close-btn" onClick={() => navigate(-1)} disabled={!!activeSheet}>〈</button>
          </div>
        
          {/* 📍 메인 화면의 장소 표시 영역 */}
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
            <button className="upload-dark-btn" onClick={handleSpotifyAdd} disabled={isLoading}>
              <div className="btn-icon-circle"><img src={spotifyIcon} alt="Spotify" width="20" height="20" /></div>
              <span>Spotify로 음악 추가</span>
            </button>
            <button className="upload-dark-btn" onClick={handleAIRecommend} disabled={isLoading}>
              <div className="btn-icon-circle"><img src={aiIcon} alt="AI" width="20" height="20" /></div>
              <span>AI로 음악 추천</span>
            </button>
          </div>

          <div className="upload-image-area" onClick={handleImageUpload}>
            <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
            {imagePreview ? (
              <><img src={imagePreview} alt="preview" className="upload-preview-img" /><button className="image-remove-btn" onClick={handleRemoveImage}>✕</button></>
            ) : (
              <><span className="plus-icon">⊕</span><p>사진을 추가해보세요</p></>
            )}
            {selectedTrack && (
              <div className="selected-track-overlay" onClick={(e) => e.stopPropagation()}>
                <img src={selectedTrack.album?.images[0]?.url || 'https://picsum.photos/50'} alt="album" className="selected-track-img" />
                <div className="selected-track-info">
                  <span className="selected-track-title">{selectedTrack.name}</span><span className="selected-track-artist">{selectedTrack.artists[0]?.name}</span>
                </div>
                <button className="selected-track-remove" onClick={(e) => { e.stopPropagation(); setSelectedTrack(null); }}>✕</button>
              </div>
            )}
          </div>

          <textarea className="upload-input-area" placeholder="이 장소에 어울리는 한마디를 남겨보세요." value={content} onChange={(e) => setContent(e.target.value)} disabled={isLoading} />
          <button className="upload-share-btn" onClick={handleShare} disabled={isLoading}>{isLoading ? "작성 중..." : "공유"}</button>
        </div>

        {/* 바텀 시트 영역 */}
        <div className={`sheet-overlay ${activeSheet ? 'active' : ''}`} onClick={() => setActiveSheet(null)}></div>
        
        <div className={`bottom-sheet ${activeSheet ? 'active' : ''} ${isDragging ? 'dragging' : ''}`} style={{ transform: `translateY(${activeSheet ? sheetTranslateY + 'px' : '100%'})` }}>
          <div className="sheet-handle-zone" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <div className="sheet-handle"></div>
          </div>
          
          <div className="sheet-content-area">
            {activeSheet === 'spotify' && <TrackSearch onSelect={handleTrackSelect} />}
            {activeSheet === 'ai' && <AIRecommend onSelect={handleTrackSelect} />}
            
            {/* 바텀 시트 내부의 장소 검색 UI */}
            {activeSheet === 'place' && (
              <div className="place-sheet-wrap">
                <h2 className="place-sheet-title">장소 검색</h2>
                <div className="place-sheet-input-box">
                  <input 
                    type="text" 
                    className="place-search-input" 
                    placeholder="장소 이름을 입력하세요"
                    value={searchKeyword}
                    onChange={handleSearchChange}
                    disabled={isVerifyingLoc}

                  />
                  {/* 검색 중이거나 검증 중일 때 텍스트 표시 */}
                  {(isSearching || isVerifyingLoc) && (
                    <span className="place-search-loading">
                      {isVerifyingLoc ? "위치 검증 중..." : "검색 중..."}
                    </span>
                  )}
                </div>
                
                <ul className="place-search-results">
                  {searchResults.map((place) => (
                    <li key={place.id} onClick={() => handleSelectPlace(place)}>
                      {/* 💡 카카오 지도 스타일로 정보 배치 */}
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

      </div>
    </section>
  );
}

export default UploadGraffiti;