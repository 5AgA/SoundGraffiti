/** @param {unknown} raw */
function normalizeSpotifyTrackId(raw) {
  if (raw == null) return "";
  const s =
    typeof raw === "string"
      ? raw.trim()
      : typeof raw === "number" && Number.isFinite(raw)
        ? String(raw)
        : "";
  if (!s) return "";
  const uri = s.match(/^spotify:track:(.+)$/i);
  if (uri) return uri[1].trim();
  return s;
}

/**
 * 트랙 행에서 Spotify 웹 트랙 URL을 만든다.
 * @param {{ track_id?: unknown } | null | undefined} track
 * @returns {string} 빈 문자열이면 열 수 없음
 */
export function spotifyTrackWebUrl(track) {
  const id = normalizeSpotifyTrackId(track?.track_id);
  if (!id) return "";
  if (/^https?:\/\//i.test(id)) return id;
  return `https://open.spotify.com/track/${encodeURIComponent(id)}`;
}

/**
 * @param {string} url
 * @returns {boolean} 새 탭/창으로 연 것으로 보이면 true
 */
function openUrlInNewTab(url) {
  if (!url) return false;
  const w = window.open(url, "_blank");
  if (w != null) return true;
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.referrerPolicy = "no-referrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{ track_id?: unknown } | null | undefined} track
 * @returns {"ok" | "no_track" | "blocked"}
 */
export function openSpotifyTrackInBrowser(track) {
  const url = spotifyTrackWebUrl(track);
  if (!url) return "no_track";
  if (openUrlInNewTab(url)) return "ok";
  return "blocked";
}
