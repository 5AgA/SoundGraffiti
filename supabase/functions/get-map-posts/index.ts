import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FEED_RADIUS_METERS = 200;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAP_POST_SELECT = `
  post_id,
  content,
  post_created,
  preview_start_ms,
  preview_end_ms,
  Users (user_name, user_profile_url),
  Places (place_id, place_name, latitude, longitude, external_place_id, address),
  Tracks (track_id, track_title, artist_name, album_image_url, preview_url, duration_ms)
`;

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function distanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(latitudeB - latitudeA);
  const dLng = toRadians(longitudeB - longitudeA);
  const latA = toRadians(latitudeA);
  const latB = toRadians(latitudeB);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(h)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const userLatitude = toFiniteNumber(body?.latitude);
    const userLongitude = toFiniteNumber(body?.longitude);
    const hasUserCoordinates = userLatitude != null && userLongitude != null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("Posts")
      .select(MAP_POST_SELECT)
      .eq("status", "published")
      .is("post_deleted", null)
      .order("post_created", { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const posts = (data ?? []).map((post) => {
      const place = firstOrSelf(post.Places);
      const latitude = toFiniteNumber(place?.latitude);
      const longitude = toFiniteNumber(place?.longitude);
      const distance =
        hasUserCoordinates && latitude != null && longitude != null
          ? distanceMeters(userLatitude, userLongitude, latitude, longitude)
          : null;

      return {
        ...post,
        Places: place,
        distance_meters: distance,
        within_feed_radius:
          distance != null && distance <= FEED_RADIUS_METERS,
      };
    });

    return new Response(
      JSON.stringify({
        count: posts.length,
        radius_meters: FEED_RADIUS_METERS,
        posts,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
