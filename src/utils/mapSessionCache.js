// 로그인 세션 동안 지도 포스트 스냅샷 (탭 전환 시 재요청 방지)
let cache = {
  hasSnapshot: false,
  posts: [],
};

export function readMapSessionCache() {
  if (!cache.hasSnapshot) return null;
  return { posts: [...cache.posts] };
}

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
