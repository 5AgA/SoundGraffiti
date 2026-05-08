import { supabase } from '../supabaseClient'

export const createPost = async ({ userId, trackId, placeId, content, previewStartMs, previewEndMs }) => {
  const { data, error } = await supabase.functions.invoke('create-post', {
    body: { userId, trackId, placeId, content, previewStartMs, previewEndMs }
  })

  if (error) console.error(error)
  return data
}

export const updatePost = async ({ postId, content }) => {
  const { data, error } = await supabase.functions.invoke('update-post', {
    body: { postId, content }
  })

  if (error) console.error(error)
  return data
}

export const deletePost = async ({ postId }) => {
  const { data, error } = await supabase.functions.invoke('delete-post', {
    body: { postId }
  })

  if (error) console.error(error)
  return data
}

export const getFeed = async () => {
  const { data, error } = await supabase.functions.invoke('get-feed')

  if (error) console.error(error)
  return data
}

/**
 * 특정 유저의 게시글 목록 (피드와 동일 조건). Edge Function 미배포·실패 시 클라이언트 직조회 폴백.
 * @param {number} userId
 */
export const getPostsByUserId = async (userId) => {
  const { data, error } = await supabase.functions.invoke('get-user-posts', {
    body: { userId },
  })

  if (!error && Array.isArray(data)) {
    return data
  }

  if (error) {
    console.warn('get-user-posts invoke:', error.message ?? error)
  }

  const select = `
      post_id,
      content,
      post_created,
      Places (place_name),
      Tracks (track_title, artist_name, album_image_url, preview_url, duration_ms),
      PostMedia (media_url),
      Likes (like_id)
    `

  const { data: rows, error: qErr } = await supabase
    .from('Posts')
    .select(select)
    .eq('user_id', userId)
    .is('post_deleted', null)
    .in('status', ['published', 'draft'])
    .order('post_created', { ascending: false })

  if (qErr) {
    console.error('getPostsByUserId fallback:', qErr)
    return []
  }

  return Array.isArray(rows) ? rows : []
}