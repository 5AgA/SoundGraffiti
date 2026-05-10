import React, { useState, useRef } from 'react';
import './CreatePost.css';
import spotifyIcon from '../../public/spotify.svg';
import aiicon from '../../public/AI.svg';
import TrackSearch from './TrackSearch';
import AIRecommend from './AIRecommend';
import { supabase } from '../supabaseClient'; 

function UploadGraffiti({ onGoToHome }) {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // 바텀 시트 및 선택된 음악 상태 관리
  const [activeSheet, setActiveSheet] = useState(null);
  const [selectedTrack, setSelectedTrack] = useState(null);

  // 📸 사진 업로드 관련 상태 및 Ref
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);

  const handleSpotifyAdd = () => setActiveSheet('spotify');
  const handleAIRecommend = () => setActiveSheet('ai');

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
    e.stopPropagation(); // 부모 박스의 클릭 이벤트(갤러리 열기)가 실행되지 않도록 완벽 차단!
    setImageFile(null);
    setImagePreview(null);
    // input 값도 초기화해 줘야 똑같은 사진을 다시 선택했을 때 인식이 돼!
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; 
    }
  };

  const handleShare = async () => {
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

      // ==========================================
      // 2️⃣ 게시글(Post) DB에 저장 (create-post)
      // ==========================================
      const postData = {
        userId: 1, 
        trackId: selectedTrack.id, 
        placeId: 19, 
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

      // ==========================================
      // 4️⃣ 모든 과정 완벽하게 성공!
      // ==========================================
      alert("그래피티가 성공적으로 기록되었습니다!");
      
      // 상태 초기화 및 홈으로 이동
      setContent('');
      setSelectedTrack(null);
      setImageFile(null);
      setImagePreview(null);
      if (onGoToHome) onGoToHome();

    } catch (err) {
      console.error("업로드 에러 상세:", err);
      const errorMessage = err.message || "알 수 없는 오류";
      alert(`업로드 실패 😥\n이유: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

    return (
    <section className="upload-wrap">
      <div className="upload-phone">
        
        {/* 💡 스크롤 되는 영역만 따로 감싸기 */}
        <div className="upload-scroll-area">
          <h1 className="upload-title">UPLOAD MY GRAFFITI</h1>

          <div className="upload-btn-group">
            <button className="upload-dark-btn" onClick={handleSpotifyAdd} disabled={isLoading}>
              <div className="btn-icon-circle">
                <img src={spotifyIcon} alt="Spotify" width="20" height="20" />
              </div>
              <span>Spotify로 음악 추가</span>
            </button>
            
            <button className="upload-dark-btn" onClick={handleAIRecommend} disabled={isLoading}>
              <div className="btn-icon-circle">
                  <img src={aiicon} alt="AI" width="20" height="20" />
              </div>
              <span>AI로 음악 추천 받기</span>
            </button>
          </div>

          {/* 📸 사진 업로드 영역 */}
          <div className="upload-image-area" onClick={handleImageUpload}>
            <input 
              type="file" accept="image/*" ref={fileInputRef} 
              style={{ display: 'none' }} onChange={handleFileChange} 
            />
            
            {imagePreview ? (
              <>
                <img src={imagePreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '26.4px' }} />
                
                {/* 💡 우측 상단 사진 삭제 버튼 */}
                <button className="image-remove-btn" onClick={handleRemoveImage}>
                  ✕
                </button>
              </>
            ) : (
              <>
                <span className="plus-icon">⊕</span>
                <p>사진을 추가해보세요</p>
              </>
            )}

            {/* 선택된 음악 플로팅 스티커 */}
            {selectedTrack && (
              <div className="selected-track-overlay" onClick={(e) => e.stopPropagation()}>
                <img src={selectedTrack.album?.images[0]?.url || 'https://picsum.photos/50'} alt="album" className="selected-track-img" />
                <div className="selected-track-info">
                  <span className="selected-track-title">{selectedTrack.name}</span>
                  <span className="selected-track-artist">{selectedTrack.artists[0]?.name}</span>
                </div>
                <button className="selected-track-remove" onClick={(e) => { e.stopPropagation(); setSelectedTrack(null); }}>✕</button>
              </div>
            )}
          </div>

          <textarea 
            className="upload-input-area"
            placeholder="이 장소에 어울리는 한마디를 남겨보세요."
            value={content} onChange={(e) => setContent(e.target.value)} disabled={isLoading}
          />

          <button className="upload-share-btn" onClick={handleShare} disabled={isLoading}>
            {isLoading ? "작성 중..." : "공유"}
          </button>
        </div>
        {/* 💡 --- 스크롤 영역 끝 --- */}

        {/* 💡 바텀 시트는 스크롤 영역 밖으로 분리 (절대 같이 스크롤 안 됨) */}
        <div className={`sheet-overlay ${activeSheet ? 'active' : ''}`} onClick={() => setActiveSheet(null)}></div>
        
        <div className={`bottom-sheet ${activeSheet ? 'active' : ''}`}>
          <div className="sheet-handle-wrap" onClick={() => setActiveSheet(null)}>
            <div className="sheet-handle"></div>
          </div>
          <div className="sheet-content-area">
            {activeSheet === 'spotify' && <TrackSearch onSelect={handleTrackSelect} />}
            {activeSheet === 'ai' && <AIRecommend onSelect={handleTrackSelect} aiIconSrc={aiicon} />}
          </div>
        </div>

      </div>
    </section>
  );
}

export default UploadGraffiti;