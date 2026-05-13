import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

function AIRecommend({ onSelect }) {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]); 
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!prompt.trim() || isLoading) return;

    const userMsg = prompt;
    setMessages([{ role: 'user', content: userMsg }]);
    setPrompt('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('recommend-music', {
        body: { userInput: userMsg }
      });

      if (error) throw error;

      setMessages([
        { role: 'user', content: userMsg },
        { 
          role: 'ai', 
          content: data.analysis || '이 분위기에 어울리는 음악을 골라봤어요.', 
          tracks: data.recommendations || [] // 💡 여기에 진짜 스포티파이 트랙들이 들어있음!
        }
      ]);
    } catch (err) {
      console.error(err);
      
      // 💡 백엔드에서 넘어온 진짜 에러 메시지를 잡아서 화면에 보여줌!
      setMessages([
        { role: 'user', content: userMsg },
        { 
          role: 'ai', 
          content: `앗, 에러가 발생했어요.. 다시 시도해주세요`, // 화면에 에러 이유 출력!
          tracks: [] 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ai-recommend-wrap">
      <div className="ai-header">
        <span>Graffi가 음악을 추천해줘요!</span>
      </div>

      <div className="ai-chat-area">
        {messages.map((msg, idx) => (
          msg.role === 'user' ? (
            <div key={idx} className="ai-user-bubble">{msg.content}</div>
          ) : (
            <div key={idx} className="ai-result-box">
              <p className="ai-result-title">{msg.content}</p>
              
              {/* 💡 진짜 스포티파이 데이터로 렌더링하도록 수정된 부분! */}
              {msg.tracks && msg.tracks.map((track, tIdx) => (
                <div key={tIdx} className="ai-track-item">
                  
                  {/* 스포티파이 진짜 앨범 커버 이미지 출력 */}
                  <img 
                    src={track.album?.images[0]?.url || 'https://picsum.photos/50'} 
                    alt={track.name} 
                    className="ai-track-img" 
                  />
                  
                  <div className="ai-track-info">
                    {/* 스포티파이 진짜 노래 제목 & 가수 출력 */}
                    <p className="ai-track-title">{track.name}</p>
                    <p className="ai-track-artist">{track.artists?.[0]?.name}</p>
                  </div>
                  
                  <button
                    className="ai-select-btn"
                    // 💡 통째로 스포티파이 객체를 부모(CreatePost)로 넘겨버림!
                    onClick={() => onSelect(track)}
                  >
                    선택
                  </button>
                </div>
              ))}
            </div>
          )
        ))}
        
        {isLoading && (
          <div className="ai-result-box" style={{ alignItems: 'center' }}>
            <p className="ai-loading-text">
              그래피(Graffi)가 음악을 찾고 있어요
              <span className="dot">.</span>
              <span className="dot">.</span>
              <span className="dot">.</span>
            </p>
          </div>
        )}
      </div>

      <div className="ai-input-wrap">
        <input
          type="text"
          className="ai-input"
          placeholder="이 공간에서 느낀 감정을 작성해보세요"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={isLoading}
        />
        <button
          type="button"
          className="ai-submit-btn"
          aria-label="보내기"
          onClick={handleSend}
          disabled={isLoading || !prompt.trim()}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M5 12h14M13 5l7 7-7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default AIRecommend;
