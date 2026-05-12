/** `public/default.profile.png` — 프로필 URL 없을 때 사용 */
export const DEFAULT_PROFILE_IMAGE = "/default.profile.png";

/**
 * @param {string | null | undefined} url
 * @returns {string}
 */
export function resolvedProfileImageUrl(url) {
  if (typeof url === "string" && url.trim() !== "") return url.trim();
  return DEFAULT_PROFILE_IMAGE;
}
