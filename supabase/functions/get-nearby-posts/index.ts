import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req) => {
  // CORS 프리플라이트 처리
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { latitude, longitude } = await req.json();

    if (latitude == null || longitude == null) {
      return new Response(
        JSON.stringify({ error: "latitude와 longitude는 필수입니다." }),
        { status: 400, headers: corsHeaders }
      );
    }

    // DB에서 만든 RPC 함수 호출
    // PostGIS가 내부적으로 200m 이내 계산 및 Join을 모두 처리함
    const { data, error } = await supabase.rpc("get_nearby_posts", {
      p_user_lat: Number(latitude),
      p_user_lng: Number(longitude),
      p_radius_meters: 200 // 기본값 200m
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        message: "주변 200m 이내 포스트 조회 성공",
        count: data?.length ?? 0,
        posts: data,
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "알 수 없는 오류",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});