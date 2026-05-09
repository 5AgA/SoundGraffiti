import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** `get-feed` 와 동일한 중첩 필드 — 홈 카드 UI와 맞춤 */
const FEED_POST_SELECT = `
  post_id,
  content,
  post_created,
  Users (user_name, user_profile_url),
  Places (place_name),
  Tracks (track_title, artist_name, album_image_url, preview_url, duration_ms),
  PostMedia (media_url),
  Likes (like_id, user_id, Users (user_name)),
  Comments (
    comment_id,
    user_id,
    comment_deleted,
    content,
    comment_created,
    parent_comment_id,
    Users (user_id, user_name, user_profile_url)
  )
`;

type RpcRow = Record<string, unknown>;

/** RPC가 최소 컬럼만 줄 때 post_id 목록 추출 (순서 유지) */
function extractPostIdsOrdered(rows: RpcRow[] | null): unknown[] {
  if (!rows?.length) return [];
  const seen = new Set<string>();
  const ids: unknown[] = [];
  for (const row of rows) {
    const raw = row.post_id ?? row.postId ?? row.id;
    if (raw == null && raw !== 0) continue;
    const key = String(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(raw);
  }
  return ids;
}

function alreadyHydratedLikeFeed(rows: RpcRow[]): boolean {
  if (!rows.length) return false;
  const r = rows[0];
  return (
    r != null &&
    typeof r === "object" &&
    (Object.prototype.hasOwnProperty.call(r, "Tracks") ||
      Object.prototype.hasOwnProperty.call(r, "Users"))
  );
}

serve(async (req) => {
  // CORS 프리플라이트 처리
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { latitude, longitude } = await req.json();

    if (latitude == null || longitude == null) {
      return new Response(
        JSON.stringify({ error: "latitude와 longitude는 필수입니다." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: rpcRows, error: rpcError } = await supabase.rpc(
      "get_nearby_posts",
      {
        p_user_lat: Number(latitude),
        p_user_lng: Number(longitude),
        p_radius_meters: 200,
      },
    );

    if (rpcError) {
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = (rpcRows ?? []) as RpcRow[];

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({
          message: "주변 200m 이내 포스트 없음",
          count: 0,
          posts: [],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (alreadyHydratedLikeFeed(rows)) {
      return new Response(
        JSON.stringify({
          message: "주변 200m 이내 포스트 조회 성공",
          count: rows.length,
          posts: rows,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const idsOrdered = extractPostIdsOrdered(rows);
    if (!idsOrdered.length) {
      return new Response(
        JSON.stringify({
          error:
            "get_nearby_posts 결과에서 post_id를 찾을 수 없습니다. RPC 반환 컬럼명을 확인해 주세요.",
          posts: [],
          count: 0,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: posts, error: postsError } = await supabase
      .from("Posts")
      .select(FEED_POST_SELECT)
      .in("post_id", idsOrdered)
      .is("post_deleted", null)
      .in("status", ["published", "draft"]);

    if (postsError) {
      return new Response(JSON.stringify({ error: postsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const list = posts ?? [];
    const orderMap = new Map(
      idsOrdered.map((id, i) => [String(id), i]),
    );
    list.sort((a, b) => {
      const ia = orderMap.get(String(a.post_id)) ?? 9999;
      const ib = orderMap.get(String(b.post_id)) ?? 9999;
      return ia - ib;
    });

    return new Response(
      JSON.stringify({
        message: "주변 200m 이내 포스트 조회 성공",
        count: list.length,
        posts: list,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "알 수 없는 오류",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
