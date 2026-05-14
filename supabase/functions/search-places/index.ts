// supabase/functions/search-places/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const KAKAO_REST_API_KEY = Deno.env.get('VITE_KAKAO_REST_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** 카카오 로컬 category_group_code — 식당·카페·문화·관광·교통·공공·의료 등 우선 */
const PREFERRED_CATEGORY_CODES = new Set([
  'FD6', // 음식점
  'CE7', // 카페
  'CT1', // 문화시설
  'AT4', // 관광명소
  'PO3', // 공공기관
  'SW8', // 지하철역
  'PK6', // 주차장
  'HP8', // 병원
  'PM9', // 약국
  'AC5', // 학원
  'SC4', // 학교
  'BK9', // 은행
  'AD5', // 숙박
  'MT1', // 대형마트
  'CS2', // 편의점
  'OL7', // 주유소
])

/** 부동산 중개 등 — 주거·매물 성격이 강해 뒤로 */
const DEPRIORITY_CATEGORY_CODES = new Set(['AG2'])

function mapKeywordDocuments(data: { documents?: any[] }) {
  const docs = data.documents ?? []
  return docs.map((doc: any) => ({
    id: doc.id,
    place_name: doc.place_name,
    category_group_name:
      doc.category_group_name ||
      doc.category_name?.split('>').pop()?.trim() ||
      '',
    category_group_code: typeof doc.category_group_code === 'string' ? doc.category_group_code : '',
    category_name: typeof doc.category_name === 'string' ? doc.category_name : '',
    road_address_name: doc.road_address_name,
    address_name: doc.address_name,
    x: doc.x,
    y: doc.y,
    distance: doc.distance,
  }))
}

function placeRankScore(p: {
  place_name?: string
  category_name?: string
  category_group_code?: string
}): number {
  const name = `${p.place_name ?? ''} ${p.category_name ?? ''}`
  if (/우체(국|통)/.test(name)) return -800
  if (DEPRIORITY_CATEGORY_CODES.has(String(p.category_group_code || ''))) return -600
  const cat = String(p.category_name || '')
  // 주거 시설로 분류된 POI는 식당 등이 아닐 때만 강등
  if (
    /(주택|다가구|다세대|연립주택|도시형생활주택|원룸|투룸)/.test(cat) &&
    !/(음식점|카페|한식|중식|일식|양식|분식|패스트푸드|치킨|피자|카페,디저트)/.test(cat)
  ) {
    return -400
  }
  if (PREFERRED_CATEGORY_CODES.has(String(p.category_group_code || ''))) return 120
  return 0
}

function distanceSortKey(p: { distance?: string | number }): number {
  const d = p.distance
  if (d == null) return Number.POSITIVE_INFINITY
  const n = typeof d === 'number' ? d : Number.parseFloat(String(d))
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

function sortPlacesForGraffitiContext<T extends ReturnType<typeof mapKeywordDocuments>[number]>(
  rows: T[],
): T[] {
  const copy = [...rows]
  copy.sort((a, b) => {
    const sb = placeRankScore(b) - placeRankScore(a)
    if (sb !== 0) return sb
    return distanceSortKey(a) - distanceSortKey(b)
  })
  return copy
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

    const results = sortPlacesForGraffitiContext(mapKeywordDocuments(data))

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