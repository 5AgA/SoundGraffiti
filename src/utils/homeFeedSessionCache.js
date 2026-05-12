/**
 * 로그인 세션 동안만 유지되는 홈 주변 피드 스냅샷.
 * /home ↔ 다른 탭 이동 시 컴포넌트가 언마운트돼도 다시 불러오지 않도록 사용.
 */

let cache = {
  /** null = 아직 한 번도 성공/실패 스냅샷 없음 · [] = 빈 피드 */
  feed: null,
  feedLoadError: null,
  devGeoBypassNotice: null,
  coords: null,
};

export function readHomeFeedSessionCache() {
  return { ...cache };
}

export function writeHomeFeedSessionCache(partial) {
  cache = { ...cache, ...partial };
}

export function clearHomeFeedSessionCache() {
  cache = {
    feed: null,
    feedLoadError: null,
    devGeoBypassNotice: null,
    coords: null,
  };
}
