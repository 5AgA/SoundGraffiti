import { createPost } from '../api/posts'

function PostForm() {
  const handleSubmit = async () => {
    await createPost({
      userId: 1,
      trackId: '4qdBPJta3BVPXCS0wJZ6yO',
      placeId: 5,
      content: '테스트 포스트'
    })
    console.log('포스트 작성 완료!')
  }

  return <button onClick={handleSubmit}>포스트 작성 테스트</button>
}

export default PostForm