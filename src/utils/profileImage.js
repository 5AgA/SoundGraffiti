/** `public/default.profile.png` — 프로필 URL 없을 때 사용 */
export const DEFAULT_PROFILE_IMAGE = "/default.profile.png";

/**
 * Users 행의 `user_profile_url` 원문.
 * 행이 있으면 null·빈 문자열은 `''`(기본 이미지). 행이 없으면 `undefined`.
 * @param {{ user_profile_url?: unknown } | null | undefined} row
 */
export function profileUrlRawFromUsersRow(row) {
  if (row == null) return undefined;
  const v = row.user_profile_url;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : "";
}

/**
 * @param {string | null | undefined} url
 * @returns {string}
 */
export function resolvedProfileImageUrl(url) {
  if (typeof url === "string" && url.trim() !== "") return url.trim();
  return DEFAULT_PROFILE_IMAGE;
}
