// supabase/functions/upsert-place/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // 💡 프론트엔드에서 보낸 장소 정보 받기
    const { placeName, address, latitude, longitude, externalPlaceId } = await req.json();
    if (!externalPlaceId) throw new Error('카카오 장소 ID(externalPlaceId)가 필요합니다.');
    // 💡 Supabase 클라이언트 초기화 (사용자 권한 유지)
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    // 1️⃣ 기존에 저장된 장소인지 확인 (external_place_id 기준)
    const { data: existingPlace, error: searchError } = await supabase.from('Places').select('place_id').eq('external_place_id', String(externalPlaceId)).maybeSingle();
    if (searchError) throw searchError;
    // 🎯 이미 DB에 있으면 기존 place_id 바로 반환!
    if (existingPlace) {
      return new Response(JSON.stringify({
        place_id: existingPlace.place_id
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // 2️⃣ DB에 없는 새로운 장소면 새로 Insert!
    const { data: newPlace, error: insertError } = await supabase.from('Places').insert({
      place_name: placeName,
      address: address,
      latitude: latitude,
      longitude: longitude,
      external_place_id: String(externalPlaceId)
    }).select('place_id').single();
    if (insertError) throw insertError;
    // 🎯 새로 만든 place_id 반환!
    return new Response(JSON.stringify({
      place_id: newPlace.place_id
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
