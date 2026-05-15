// DEV + HTTP(LAN): Geolocation 대신 .env 고정 좌표 (VITE_DEV_GEO_COORDS 등)
export function getDevGeoCoordinates() {
  if (!import.meta.env.DEV) return null;

  const combined =
    import.meta.env.VITE_DEV_GEO_COORDS ?? import.meta.env.VITE_DEV_COMMENT_COORDS;
  if (typeof combined === "string" && combined.trim()) {
    const parts = combined.split(",").map((s) => Number(s.trim()));
    if (
      parts.length >= 2 &&
      Number.isFinite(parts[0]) &&
      Number.isFinite(parts[1])
    ) {
      return { lat: parts[0], lng: parts[1] };
    }
  }

  const lat = Number(import.meta.env.VITE_DEV_GEO_LAT ?? import.meta.env.VITE_DEV_COMMENT_LAT);
  const lng = Number(import.meta.env.VITE_DEV_GEO_LNG ?? import.meta.env.VITE_DEV_COMMENT_LNG);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return null;
}
