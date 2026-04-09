import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Input: place placeName, placeLatitude / placeLongitude / userLatitude / userLongitude

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
    const {
      placeName,
      placeLatitude,
      placeLongitude,
      userLatitude,
      userLongitude,
    } = await req.json()

    if (
      placeLatitude == null ||
      placeLongitude == null ||
      userLatitude == null ||
      userLongitude == null
    ) {
      return new Response(
        JSON.stringify({
          error: 'placeLatitude, placeLongitude, userLatitude, userLongitude는 필수입니다.',
        }),
        { status: 400, headers: corsHeaders }
      )
    }

    const pLat = Number(placeLatitude)
    const pLng = Number(placeLongitude)
    const uLat = Number(userLatitude)
    const uLng = Number(userLongitude)

    if (
      Number.isNaN(pLat) ||
      Number.isNaN(pLng) ||
      Number.isNaN(uLat) ||
      Number.isNaN(uLng)
    ) {
      return new Response(
        JSON.stringify({ error: '위도와 경도는 숫자여야 합니다.' }),
        { status: 400, headers: corsHeaders }
      )
    }

    const distance = getDistanceInMeters(uLat, uLng, pLat, pLng)
    const isAccessible = distance <= ACCESS_RADIUS_METERS

    return new Response(
      JSON.stringify({
        place_name: placeName ?? null,
        distance_meters: distance,
        is_accessible: isAccessible,
        message: isAccessible
          ? '작성 가능합니다.'
          : '해당 장소 반경 200m 이내에서만 작성할 수 있습니다.',
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