/**
 * 로그인 세션 동안만 유지되는 지도 포스트 스냅샷.
 * 탭 이동으로 Map 언마운트 후에도 자동 재요청하지 않도록 사용.
 * Graffiti Map 로고 탭 시에만 서버에서 다시 불러옴.
 */

let cache = {
  /** false = 아직 이 세션에서 한 번도 저장 안 함 */
  hasSnapshot: false,
  posts: /** @type {unknown[]} */ ([]),
};

export function readMapSessionCache() {
  if (!cache.hasSnapshot) return null;
  return { posts: [...cache.posts] };
}

/** @param {unknown[]} posts */
export function writeMapSessionCache(posts) {
  const arr = Array.isArray(posts) ? posts : [];
  cache = {
    hasSnapshot: true,
    posts: arr.map((p) => (p != null && typeof p === "object" ? { ...p } : p)),
  };
}

export function clearMapSessionCache() {
  cache = { hasSnapshot: false, posts: [] };
}
