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
