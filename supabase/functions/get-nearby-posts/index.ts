import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const ACCESS_RADIUS_METERS = 200;

type NearbyPlace = {
  place_id: number;
  place_name: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
};

function getDistanceInMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getBoundingBox(
  latitude: number,
  longitude: number,
  radiusMeters: number
) {
  const latDelta = radiusMeters / 111320;
  const lngDelta =
    radiusMeters / (111320 * Math.cos((latitude * Math.PI) / 180));

  return {
    minLat: latitude - latDelta,
    maxLat: latitude + latDelta,
    minLng: longitude - lngDelta,
    maxLng: longitude + lngDelta,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "POST 요청만 허용됩니다." }),
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    const body = await req.json();
    const { latitude, longitude } = body;

    if (latitude == null || longitude == null) {
      return new Response(
        JSON.stringify({ error: "latitude와 longitude는 필수입니다." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const userLat = Number(latitude);
    const userLng = Number(longitude);
    if (Number.isNaN(userLat) || Number.isNaN(userLng)) {
      return new Response(
        JSON.stringify({ error: "latitude와 longitude는 숫자여야 합니다." }),
        { status: 400, headers: corsHeaders }
      );
    }
    const { minLat, maxLat, minLng, maxLng } = getBoundingBox(
      userLat,
      userLng,
      ACCESS_RADIUS_METERS
    );
    // 1. 장소 조회
    const { data: places, error: placesError } = await supabase
      .from("Places") // 실제 relation name 확인 필요
      .select("place_id, place_name, latitude, longitude")
      .gte("latitude", minLat)
      .lte("latitude", maxLat)
      .gte("longitude", minLng)
      .lte("longitude", maxLng);

    if (placesError) {
      return new Response(
        JSON.stringify({ error: placesError.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    // 2. 반경 200m 이내 장소 필터링
    const nearbyPlaces: NearbyPlace[] = (places ?? [])
      .map((place) => {
        const distance = getDistanceInMeters(
          userLat,
          userLng,
          place.latitude,
          place.longitude
        );

        return {
          ...place,
          distance_meters: distance,
        };
      })
      .filter((place) => place.distance_meters <= ACCESS_RADIUS_METERS);

    const nearbyPlaceIds = nearbyPlaces.map((place) => place.place_id);

    if (nearbyPlaceIds.length === 0) {
      return new Response(
        JSON.stringify({
          message: "반경 200m 이내 포스트가 없습니다.",
          count: 0,
          posts: [],
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 3. 해당 장소에 속한 posts 조회
    const { data: posts, error: postsError } = await supabase
      .from("Posts")
      .select("post_id, content, post_created, status, user_id, track_id, place_id")
      .in("place_id", nearbyPlaceIds)
      .eq("status", "published")
      .order("post_created", { ascending: false });

    if (postsError) {
      return new Response(
        JSON.stringify({ error: postsError.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    // 4. 장소명과 거리 붙이기
    const placeMap = new Map<number, NearbyPlace>(
      nearbyPlaces.map((place) => [place.place_id, place])
    );

    const result = (posts ?? []).map((post) => {
      const place = placeMap.get(post.place_id);

      return {
        ...post,
        place_name: place?.place_name ?? null,
        distance_meters: place?.distance_meters ?? null,
      };
    });

    return new Response(
      JSON.stringify({
        message: "주변 200m 이내 포스트 조회 성공",
        user_location: {
          latitude: userLat,
          longitude: userLng,
        },
        count: result.length,
        posts: result,
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