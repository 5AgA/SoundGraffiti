import { useState } from 'react'
import { searchTracks } from '../api/spotify'
import { saveTrack } from '../api/tracks'

function TrackSearch({ onSelect }) {
  const [query, setQuery] = useState('')
  const [tracks, setTracks] = useState([])

  const handleSearch = async () => {
    const results = await searchTracks(query)
    if (results) setTracks(results)
  }

  const handleSelect = async (track) => {
    const saved = await saveTrack(track)
    console.log('저장된 트랙:', saved)
    onSelect(saved)  // 부모로 전달
    setTracks([])    // 검색 결과 초기화
    setQuery('')
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="트랙 검색"
      />
      <button onClick={handleSearch}>검색</button>

      {tracks.map((track) => (
        <div key={track.id}>
          <img src={track.album.images[0]?.url} width={50} />
          <span>{track.name} - {track.artists[0].name}</span>
          <button onClick={() => handleSelect(track)}>선택</button>
        </div>
      ))}
    </div>
  )
}

export default TrackSearch