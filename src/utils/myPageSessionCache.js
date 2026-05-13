/**
 * 로그인 세션 동안만 유지되는 마이페이지 스냅샷.
 * 네비로 다른 탭 갔다가 돌아올 때 컴포넌트가 언마운트돼도 다시 요청하지 않도록 사용.
 * MY GRAFFITI 탭 시에만 서버에서 다시 불러옴.
 */

/** @type {null | { pageUserId: string, profile: unknown, postCount: number|null, posts: unknown[], loadError: string|null }} */
let cache = null;

export function readMyPageSessionCache() {
  if (cache == null) return null;
  return {
    ...cache,
    posts: Array.isArray(cache.posts) ? [...cache.posts] : [],
  };
}

/** @param {{ pageUserId: string, profile: unknown, postCount: number|null, posts: unknown[], loadError: string|null }} partial */
export function writeMyPageSessionCache(partial) {
  cache = {
    ...partial,
    posts: Array.isArray(partial.posts) ? [...partial.posts] : [],
  };
}

export function clearMyPageSessionCache() {
  cache = null;
}

/**
 * 홈 주변 피드 `feed`가 갱신된 뒤, 세션에 캐시된 마이 그리드 글 중 같은 post_id의 Likes만 맞춤.
 * (홈에서 내 글 좋아요/취소 후 MY 탭으로 올 때 그리드·카운트가 바로 맞도록)
 */
export function patchMyPageCachedPostsLikesFromFeedPosts(feedPosts) {
  if (cache == null || !Array.isArray(cache.posts) || !Array.isArray(feedPosts))
    return;
  /** @type {Map<string, unknown[]>} */
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
