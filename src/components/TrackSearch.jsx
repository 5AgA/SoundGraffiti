import React, { useState, useEffect } from 'react';
import { searchTracks } from '../api/spotify';

function TrackSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    setTracks([]);
    setOffset(0);
    setHasMore(true);
  }, [query]);

  useEffect(() => {
    const fetchTracks = async () => {
      if (query.trim() === '' || !hasMore) return;
      
      setIsSearching(true);
      try {
        const results = await searchTracks(query, offset);
        if (results && results.length > 0) {
          setTracks((prev) => (offset === 0 ? results : [...prev, ...results]));
          if (results.length < 10) setHasMore(false);
        } else {
          setHasMore(false); 
        }
      } catch (error) {
        console.error("스포티파이 검색 에러:", error);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(fetchTracks, 500);
    return () => clearTimeout(timeoutId);
  }, [query, offset]);

  const handleLoadMore = () => {
    if (!isSearching && hasMore) {
      setOffset(prev => prev + 10); 
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: '"Pretendard", sans-serif' }}>

      <div style={{ 
        flexShrink: 0, 
        display: 'flex', background: '#EAF2FD', 
        borderRadius: '14px', 
        padding: '12px 16px', marginBottom: '16px', alignItems: 'center' 
      }}>
        <span style={{ color: '#005EFF', marginRight: '12px', fontSize: '16px' }}>🔍</span>
        <input
          style={{ 
            flex: 1, background: 'transparent', border: 'none', 
            color: '#272729', fontSize: '15px', outline: 'none', fontFamily: '"Pretendard", sans-serif' 
          }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="어떤 음악을 추가할까요?"
        />
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', overscrollBehaviorY: 'none', 
        WebkitOverflowScrolling: 'touch', paddingBottom: '40px', scrollbarWidth: 'none' 
      }}>
        
        {query.trim() === '' ? (
          <p style={{ color: '#888', textAlign: 'center', marginTop: '40px', fontSize: '14px' }}>
            원하는 음악이나 아티스트를 검색해보세요.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {tracks.map((track, idx) => (
              <div 
                key={`${track.id}-${idx}`} 
                onClick={() => onSelect(track)}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}
              >
                <img 
                  src={track.album?.images[0]?.url || 'https://picsum.photos/50'} 
                  alt={track.name} 
                  style={{ width: '52px', height: '52px', borderRadius: '6px', objectFit: 'cover' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#272729', fontSize: '15.5px', fontWeight: '600', margin: '0 0 4px 0', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%', textAlign: 'left' }}>
                    {track.name}
                  </p>
                  <p style={{ color: '#71717A', fontSize: '13px', margin: 0, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%', textAlign: 'left' }}>
                    {track.artists.map(a => a.name).join(', ')}
                  </p>
                  {typeof track.itunes_preview_available === 'boolean' ? (
                    <p
                      style={{
                        margin: '6px 0 0 0',
                        fontSize: '11px',
                        fontWeight: 600,
                        letterSpacing: '-0.02em',
                        color: track.itunes_preview_available ? '#0B6E4F' : '#9CA3AF',
                        textAlign: 'left',
                        lineHeight: 1.3,
                      }}
                      title="iTunes Search API로 이 Spotify 결과와 같은 곡을 찾은 뒤, Apple이 제공하는 30초 미리듣기(previewUrl)가 있는지 표시합니다. 매칭이 어긋나면 실제와 다를 수 있어요."
                    >
                      {track.itunes_preview_available
                        ? 'iTunes에서 미리듣기 제공'
                        : 'iTunes에서 미리듣기 없음'}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
            
            {isSearching && (
              <p style={{ color: '#005EFF', textAlign: 'center', marginTop: '10px', fontSize: '14px', fontWeight: '500' }}>
                불러오는 중...
              </p>
            )}

            {!isSearching && hasMore && tracks.length > 0 && (
              <button 
                onClick={handleLoadMore}
                style={{
                  width: '100%', padding: '14px 0', marginTop: '8px',
                  backgroundColor: '#EAF2FD', color: '#005EFF', 
                  border: 'none', borderRadius: '12px',
                  fontFamily: '"Pretendard", sans-serif', fontSize: '15px', fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                더보기
              </button>
            )}
          </div>
        )}
        
      </div>
    </div>
  );
}

export default TrackSearch;