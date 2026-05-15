// 로그인 세션 동안 홈 피드 스냅샷 (탭 전환 시 재요청 방지)
let cache = {
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
