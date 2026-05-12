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

/**
 * 게시글 소프트 삭제 — 반드시 Edge Function `delete-post`만 사용합니다.
 * 클라이언트에서 Posts 직접 삭제/갱신하지 마세요.
 * @param {{ postId: number | string }} params
 * @returns {Promise<{ ok: true, data: unknown } | { ok: false, error: string }>}
 */
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

export const getFeed = async () => {
  const { data, error } = await supabase.functions.invoke('get-feed')

  if (error) console.error(error)
  return data
}

/**
 * 현재 위치 기준 주변 포스트 (Edge: get-nearby-posts → RPC get_nearby_posts, 기본 반경 200m)
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{ posts: unknown[], error?: string }>}
 */
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
      PostMedia (media_url, display_order),
      Likes (like_id),
      Comments (comment_id, comment_deleted)
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
