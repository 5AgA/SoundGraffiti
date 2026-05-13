import { supabase } from "../supabaseClient";

export async function resolveTrackPreview(track) {
  const { data, error } = await supabase.functions.invoke(
    "resolve-track-preview",
    {
      body: {
        trackTitle: track?.track_title || track?.name || "",
        artistName:
          track?.artist_name ||
          track?.artists?.map?.((artist) => artist?.name).filter(Boolean).join(", ") ||
          "",
        albumName: track?.album_name || track?.album?.name || "",
        durationMs: track?.duration_ms || 0,
        country: "KR",
      },
    },
  );

  if (error) {
    console.warn("resolve-track-preview failed:", error.message || error);
    return null;
  }

  return data?.previewUrl ? data : null;
}
