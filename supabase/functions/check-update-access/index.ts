import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 요청은 postId / userId / UserLatitude / userLongitude

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const ACCESS_RADIUS_METERS = 200

function getDistanceInMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'POST 요청만 허용됩니다.' }),
      { status: 405, headers: corsHeaders }
    )
  }

  try {
    const { postId, userId, userLatitude, userLongitude } = await req.json()

    if (!postId || !userId || userLatitude == null || userLongitude == null) {
      return new Response(
        JSON.stringify({
          error: 'postId, userId, userLatitude, userLongitude는 필수입니다.',
        }),
        { status: 400, headers: corsHeaders }
      )
    }

    const uLat = Number(userLatitude)
    const uLng = Number(userLongitude)

    if (Number.isNaN(uLat) || Number.isNaN(uLng)) {
      return new Response(
        JSON.stringify({ error: '위도와 경도는 숫자여야 합니다.' }),
        { status: 400, headers: corsHeaders }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. post 조회
    const { data: post, error: postError } = await supabase
      .from('Posts')
      .select('post_id, place_id, user_id, status')
      .eq('post_id', postId)
      .single()

    if (postError || !post) {
      return new Response(
        JSON.stringify({
          error: '포스트를 찾을 수 없습니다.',
          is_owner: false,
          is_accessible: false,
        }),
        { status: 404, headers: corsHeaders }
      )
    }

    // 2. 작성자 본인인지 확인
    if (Number(post.user_id) !== Number(userId)) {
      return new Response(
        JSON.stringify({
          error: '본인이 작성한 포스트만 수정할 수 있습니다.',
          is_owner: false,
          is_accessible: false,
          post_id: post.post_id,
          place_id: post.place_id,
        }),
        { status: 403, headers: corsHeaders }
      )
    }

    // 3. place 조회
    const { data: place, error: placeError } = await supabase
      .from('Places')
      .select('place_id, place_name, latitude, longitude')
      .eq('place_id', post.place_id)
      .single()

    if (placeError || !place) {
      return new Response(
        JSON.stringify({
          error: '포스트에 연결된 장소를 찾을 수 없습니다.',
          is_owner: true,
          is_accessible: false,
        }),
        { status: 404, headers: corsHeaders }
      )
    }

    // 4. 거리 계산
    const distance = getDistanceInMeters(
      uLat,
      uLng,
      Number(place.latitude),
      Number(place.longitude)
    )

    const isAccessible = distance <= ACCESS_RADIUS_METERS

    return new Response(
      JSON.stringify({
        post_id: post.post_id,
        place_id: place.place_id,
        place_name: place.place_name,
        is_owner: true,
        is_accessible: isAccessible,
        distance_meters: distance,
        message: isAccessible
          ? '수정 가능합니다.'
          : '해당 장소 반경 200m 이내에서만 수정할 수 있습니다.',
      }),
      { status: 200, headers: corsHeaders }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : '알 수 없는 오류',
      }),
      { status: 500, headers: corsHeaders }
    )
  }
})