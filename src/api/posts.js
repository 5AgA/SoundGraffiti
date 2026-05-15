import { supabase } from '../supabaseClient'

/** Edge Function `delete-post`만 사용 (클라이언트에서 Posts 직접 삭제 금지) */
export const deletePost = async ({ postId }) => {
  const { data, error } = await supabase.functions.invoke('delete-post', {
    body: { postId },
  })

  if (error) {
    console.error(error)
    return {
      ok: false,
      error: error.message ?? '삭제하지 못했습니다.',
    }
  }
  if (data && typeof data === 'object' && data.error) {
    return { ok: false, error: String(data.error) }
  }
  return { ok: true, data }
}

/** Edge: get-nearby-posts (기본 반경 200m) */
export async function getNearbyPosts(latitude, longitude) {
  const { data, error } = await supabase.functions.invoke('get-nearby-posts', {
    body: { latitude, longitude },
  })

  if (error) {
    console.error('get-nearby-posts:', error)
    let message = error.message ?? '주변 피드를 불러오지 못했습니다.'
    try {
      const ctx = error.context
      if (ctx != null) {
        const parsed =
          typeof ctx === 'object' && ctx.body != null
            ? typeof ctx.body === 'string'
              ? JSON.parse(ctx.body)
              : ctx.body
            : null
        if (parsed?.error) message = String(parsed.error)
      }
    } catch {
      /* keep message */
    }
    return { posts: [], error: message }
  }

  if (data && typeof data === 'object' && data.error) {
    return { posts: [], error: String(data.error) }
  }

  const posts = Array.isArray(data?.posts) ? data.posts : []
  return { posts, error: undefined }
}

export async function getMapPosts(latitude, longitude) {
  const lat = Number(latitude)
  const lng = Number(longitude)
  const body =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? { latitude: lat, longitude: lng }
      : {}

  const { data, error } = await supabase.functions.invoke('get-map-posts', {
    body,
  })

  if (error) {
    console.error('get-map-posts:', error)
    return {
      posts: [],
      error: error.message ?? '지도 게시물을 불러오지 못했습니다.',
    }
  }

  if (data && typeof data === 'object' && data.error) {
    return { posts: [], error: String(data.error) }
  }

  const posts = Array.isArray(data?.posts) ? data.posts : []
  return { posts, error: undefined }
}

/** Edge get-user-posts, 실패 시 클라이언트 직조회 폴백 */
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
      user_id,
      content,
      post_created,
      Users (user_name, user_profile_url),
      Places (place_name),
      Tracks (track_id, track_title, artist_name, album_image_url, preview_url, duration_ms),
      PostMedia (media_url, display_order),
      Likes (like_id, user_id, Users (user_name, user_profile_url)),
      Comments (comment_id, user_id, comment_deleted, content, comment_created, parent_comment_id, Users (user_id, user_name, user_profile_url))
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
