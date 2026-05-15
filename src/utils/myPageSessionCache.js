// 로그인 세션 동안 마이페이지 스냅샷 (탭 전환 시 재요청 방지)
let cache = null;

export function readMyPageSessionCache() {
  if (cache == null) return null;
  return {
    ...cache,
    posts: Array.isArray(cache.posts) ? [...cache.posts] : [],
  };
}

export function writeMyPageSessionCache(partial) {
  cache = {
    ...partial,
    posts: Array.isArray(partial.posts) ? [...partial.posts] : [],
  };
}

export function clearMyPageSessionCache() {
  cache = null;
}

// 홈 피드 좋아요 변경 → 마이페이지 캐시 Likes 동기화
export function patchMyPageCachedPostsLikesFromFeedPosts(feedPosts) {
  if (cache == null || !Array.isArray(cache.posts) || !Array.isArray(feedPosts))
    return;
  const likeMap = new Map();
  for (const fp of feedPosts) {
    const pid = fp?.post_id;
    if (pid == null && pid !== 0) continue;
    const raw = fp?.Likes ?? fp?.likes;
    const arr = !raw
      ? []
      : Array.isArray(raw)
        ? raw.map((row) =>
            row != null && typeof row === "object" ? { ...row } : row,
          )
        : [raw != null && typeof raw === "object" ? { ...raw } : raw];
    likeMap.set(String(pid), arr);
  }
  if (likeMap.size === 0) return;
  const nextPosts = cache.posts.map((p) => {
    const id = String(p?.post_id);
    if (!likeMap.has(id)) return p;
    return { ...p, Likes: likeMap.get(id) };
  });
  cache = { ...cache, posts: nextPosts };
}
