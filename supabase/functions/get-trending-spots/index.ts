import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 🚨 핵심 수정: 없는 주소 컬럼들 싹 빼고, 진짜 존재하는 컬럼(place_id, place_name)만 호출!
    const { data: places, error } = await supabase
      .from('Places')
      .select('place_id, place_name, Posts(post_id)');

    if (error) throw error;

    // 💡 포스트 개수 계산 후, 내림차순 정렬 -> 상위 10개 추출
    const trendingSpots = places.map((place) => ({
      place_id: place.place_id,
      place_name: place.place_name,
      post_count: place.Posts ? place.Posts.length : 0
    }))
    .filter((place) => place.post_count > 0) 
    .sort((a, b) => b.post_count - a.post_count)
    .slice(0, 11);

    return new Response(JSON.stringify({ data: trendingSpots }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});