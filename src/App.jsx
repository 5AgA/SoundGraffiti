import { useState, useEffect, useRef } from 'react'
import { createPost, updatePost, deletePost, getFeed } from './api/posts'
import { uploadMedia, saveMedia } from './api/media'
import TrackSearch from './components/TrackSearch'

function App() {
  const [feed, setFeed] = useState([])
  const [content, setContent] = useState('')
  const filesRef = useRef([])
  const [selectedTrack, setSelectedTrack] = useState(null)
  const [updateContent, setUpdateContent] = useState('')
  const [targetPostId, setTargetPostId] = useState('')

  const handleGetFeed = async () => {
    const result = await getFeed()
    setFeed(result || [])
  }

  const handleCreate = async () => {
    if (!selectedTrack) {
      alert('트랙을 선택해주세요!')
      return
    }

    const post = await createPost({
      userId: 1,
      trackId: selectedTrack.track_id,
      placeId: 5,
      content: content
    })

    console.log('생성된 포스트:', post)
    console.log('선택된 파일:', filesRef.current)

    if (filesRef.current.length > 0 && post) {
      for (let i = 0; i < filesRef.current.length; i++) {
        const mediaUrl = await uploadMedia(filesRef.current[i], post.post_id)
        console.log('업로드된 URL:', mediaUrl)
        if (mediaUrl) {
          const result = await saveMedia(post.post_id, mediaUrl, i + 1)
          console.log('PostMedia 저장 결과:', result)
        }
      }
    }

    console.log('생성 완료:', post)
    setContent('')
    filesRef.current = []
    setSelectedTrack(null)
    handleGetFeed()
  }

  const handleUpdate = async () => {
    const result = await updatePost({
      postId: targetPostId,
      content: updateContent
    })
    console.log('수정 결과:', result)
    handleGetFeed()
  }

  const handleDelete = async (postId) => {
    const result = await deletePost({ postId })
    console.log('삭제 결과:', result)
    handleGetFeed()
  }

  useEffect(() => {
    handleGetFeed()
  }, [])

  return (
    <div style={{ padding: 20 }}>
      <h2>포스트 생성</h2>
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="내용 입력"
      />
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          filesRef.current = Array.from(e.target.files)
          console.log('파일 선택됨:', filesRef.current)
        }}
      />

      {selectedTrack ? (
        <div>
          <p>선택된 트랙: {selectedTrack.track_title} - {selectedTrack.artist_name}</p>
          <button onClick={() => setSelectedTrack(null)}>트랙 변경</button>
        </div>
      ) : (
        <TrackSearch onSelect={setSelectedTrack} />
      )}

      <button onClick={handleCreate}>생성</button>

      <h2>포스트 수정</h2>
      <input
        value={targetPostId}
        onChange={(e) => setTargetPostId(e.target.value)}
        placeholder="수정할 post_id"
      />
      <input
        value={updateContent}
        onChange={(e) => setUpdateContent(e.target.value)}
        placeholder="수정할 내용"
      />
      <button onClick={handleUpdate}>수정</button>

      <h2>피드 목록</h2>
      <button onClick={handleGetFeed}>새로고침</button>
      {feed.map((post) => (
        <div key={post.post_id} style={{ border: '1px solid gray', margin: 10, padding: 10 }}>
          <p>post_id: {post.post_id}</p>
          <p>내용: {post.content}</p>
          <p>작성자: {post.Users?.user_name}</p>
          <p>장소: {post.Places?.place_name}</p>
          <p>트랙: {post.Tracks?.track_title} - {post.Tracks?.artist_name}</p>
          {post.PostMedia?.map((media, idx) => (
            <img key={idx} src={media.media_url} width={100} />
          ))}
          <button onClick={() => handleDelete(post.post_id)}>삭제</button>
        </div>
      ))}
    </div>
  )
}

export default App