// supabase/functions/search-places/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const KAKAO_REST_API_KEY = Deno.env.get('VITE_KAKAO_REST_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 💡 [수정] 프론트에서 보낸 x(경도), y(위도)도 같이 받기
    const { keyword, x, y } = await req.json()

    if (!keyword || keyword.trim() === '') {
      return new Response(JSON.stringify({ results: [] }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // 💡 [수정] 좌표가 들어오면 URL에 포함하고, 거리순(sort=distance) 적용!
    let kakaoApiUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(keyword)}`
    if (x && y) {
      kakaoApiUrl += `&x=${x}&y=${y}&radius=20000`
    }

    // 카카오 장소 검색 REST API 호출
    const response = await fetch(kakaoApiUrl, {
      headers: {
        'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}`
      }
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Kakao API Error')
    }

    // 프론트엔드에서 쓰기 편하게 데이터 정제
    const results = data.documents.map((doc: any) => ({
      id: doc.id,
      place_name: doc.place_name,
      category_group_name: doc.category_group_name || doc.category_name?.split('>').pop()?.trim() || '',
      road_address_name: doc.road_address_name,
      address_name: doc.address_name,
      x: doc.x,
      y: doc.y,
      distance: doc.distance // 💡 (옵션) 프론트에서 거리를 보여주고 싶을 때를 대비해 거리 데이터도 포함
    }))

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