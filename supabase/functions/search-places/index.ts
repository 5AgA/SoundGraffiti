// supabase/functions/search-places/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const KAKAO_REST_API_KEY = Deno.env.get('VITE_KAKAO_REST_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function mapKeywordDocuments(data: { documents?: any[] }) {
  const docs = data.documents ?? []
  return docs.map((doc: any) => ({
    id: doc.id,
    place_name: doc.place_name,
    category_group_name:
      doc.category_group_name ||
      doc.category_name?.split('>').pop()?.trim() ||
      '',
    road_address_name: doc.road_address_name,
    address_name: doc.address_name,
    x: doc.x,
    y: doc.y,
    distance: doc.distance,
  }))
}

/** 키워드가 비었을 때 좌표로 행정구역명을 구해 근처 장소 검색에 쓸 쿼리 생성 */
async function keywordFromCoordinates(
  lng: number,
  lat: number,
  kakaoKey: string,
): Promise<string> {
  const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${encodeURIComponent(String(lng))}&y=${encodeURIComponent(String(lat))}&input_coord=WGS84`
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${kakaoKey}` },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.message || 'coord2regioncode failed')
  }
  const documents = data.documents as
    | {
        region_type?: string
        region_2depth_name?: string
        region_3depth_name?: string
        address_name?: string
      }[]
    | undefined
  if (!documents?.length) return ''

  const prefer =
    documents.find((d) => d.region_type === 'B') ?? documents[0]
  const d2 = typeof prefer.region_2depth_name === 'string' ? prefer.region_2depth_name.trim() : ''
  const d3 = typeof prefer.region_3depth_name === 'string' ? prefer.region_3depth_name.trim() : ''
  const parts = [d2, d3].filter(Boolean)
  if (parts.length) return parts.join(' ')
  const addr = typeof prefer.address_name === 'string' ? prefer.address_name.trim() : ''
  return addr
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const kakaoKey = KAKAO_REST_API_KEY
    if (!kakaoKey) {
      throw new Error('Kakao REST API key is not configured')
    }

    const { keyword, x, y } = await req.json()

    let effectiveKeyword =
      typeof keyword === 'string' ? keyword.trim() : ''

    const lng = x != null ? Number(x) : NaN
    const lat = y != null ? Number(y) : NaN
    const hasCoords = Number.isFinite(lng) && Number.isFinite(lat)

    if (!effectiveKeyword && hasCoords) {
      effectiveKeyword = await keywordFromCoordinates(lng, lat, kakaoKey)
    }

    if (!effectiveKeyword) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let kakaoApiUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(effectiveKeyword)}`
    if (hasCoords) {
      kakaoApiUrl += `&x=${lng}&y=${lat}&radius=20000&sort=distance`
    }

    const response = await fetch(kakaoApiUrl, {
      headers: {
        Authorization: `KakaoAK ${kakaoKey}`,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Kakao API Error')
    }

    const results = mapKeywordDocuments(data)

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})