import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getNearbyPosts } from "../api/posts";
import BottomNav from "../components/BottomNav";
import Home from "../components/Home";
import { getDevGeoCoordinates } from "../utils/devGeoCoords";

/** GeolocationPositionError.code — 권한(1)과 좌표 실패(2·3)를 구분해 Mac 데스크톱에서 오해를 줄임 */
function feedGeolocationFailureMessage(geoErr) {
  const code = geoErr?.code;
  if (code === 1) {
    return (
      "이 사이트에 대한 위치 접근이 거부된 상태입니다.\n\n" +
      "Chrome: 주소창 왼쪽 자물쇠(ⓘ) → 사이트 설정 → 위치 → 허용\n" +
      "또는 chrome://settings/content/location 에서 이 사이트가 차단돼 있지 않은지 확인하세요.\n" +
      "Mac: 시스템 설정 → 개인 정보 보호 및 보안 → 위치 서비스에서 Chrome이 켜져 있는지 확인하세요."
    );
  }
  if (code === 2 || code === 3) {
    return (
      "위치 권한은 있어도, 지금은 좌표를 받지 못했습니다. Mac은 GPS가 없어 Wi‑Fi 기반이라 타임아웃(느린 응답)이 잦습니다.\n\n" +
      "Wi‑Fi 연결을 확인한 뒤 아래 ‘위치 다시 요청’을 눌러 보세요."
    );
  }
  return "위치를 확인할 수 없어 주변 피드를 불러올 수 없습니다.";
}

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const focusPostId = searchParams.get("postId");
  /** null = 로딩 중, 배열 = 주변 피드 결과(빈 배열 가능) */
  const [feed, setFeed] = useState(null);
  const [feedLoadError, setFeedLoadError] = useState(null);
  /** HTTP + .env 고정 좌표로 피드만 돌릴 때: 실제 GPS 권한 창이 안 뜨는 이유 안내 */
  const [devGeoBypassNotice, setDevGeoBypassNotice] = useState(null);
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);

  const coordsRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const applyPostsResult = (posts, error) => {
    if (!isMountedRef.current) return;
    if (error) {
      console.error("Nearby feed:", error);
      setFeedLoadError(error);
      setFeed([]);
      return;
    }
    setFeedLoadError(null);
    setFeed(Array.isArray(posts) ? posts : []);
  };

  const fetchNearby = useCallback(async (lat, lng) => {
    coordsRef.current = { lat, lng };
    const { posts, error } = await getNearbyPosts(lat, lng);
    applyPostsResult(posts, error);
  }, []);

  const refreshFeed = useCallback(async () => {
    const c = coordsRef.current;
    if (!c) return;
    const { posts, error } = await getNearbyPosts(c.lat, c.lng);
    applyPostsResult(posts, error);
  }, []);

  const requestGeolocationFeed = useCallback(
    (geoOptions) => {
      if (!navigator.geolocation) {
        setFeedLoadError("이 기기에서는 위치를 사용할 수 없습니다.");
        setFeed([]);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void fetchNearby(pos.coords.latitude, pos.coords.longitude);
        },
        (geoErr) => {
          if (!isMountedRef.current) return;
          if (import.meta.env.DEV) {
            console.warn("[HomePage] geolocation error", geoErr?.code, geoErr?.message);
          }
          setFeedLoadError(feedGeolocationFailureMessage(geoErr));
          setFeed([]);
        },
        {
          enableHighAccuracy: false,
          timeout: 25000,
          maximumAge: 120000,
          ...geoOptions,
        },
      );
    },
    [fetchNearby],
  );

  useEffect(() => {
    setDevGeoBypassNotice(null);

    const insecure = typeof window !== "undefined" && !window.isSecureContext;
    const devCoords = getDevGeoCoordinates();

    if (insecure && devCoords) {
      if (import.meta.env.DEV) {
        setDevGeoBypassNotice(
          "개발: .env의 고정 좌표로 피드를 불러오는 중이라 브라우저 ‘위치 허용’ 창은 뜨지 않습니다. Mac에서 실제 창을 보려면 Safari/Chrome으로 http://localhost:5173 처럼 localhost(또는 HTTPS)로 열고, VITE_DEV_GEO_COORDS 등을 비우세요.",
        );
      }
      const timer = window.setTimeout(() => {
        void fetchNearby(devCoords.lat, devCoords.lng);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (insecure && !devCoords) {
      const timer = window.setTimeout(() => {
        setFeedLoadError(
          "이 주소는 HTTP(비보안)라서 위치 권한 창이 뜨지 않거나 GPS가 막힙니다. Mac에서도 http://192.168… 같은 LAN 주소로 열면 동일합니다. http://localhost:5173 또는 HTTPS(배포 URL)로 열거나, 개발용으로 .env.local 에 VITE_DEV_GEO_COORDS=위도,경도 를 넣은 뒤 dev 서버를 다시 실행해 주세요.",
        );
        setFeed([]);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (!navigator.geolocation) {
      const timer = window.setTimeout(() => {
        setFeedLoadError("이 기기에서는 위치를 사용할 수 없습니다.");
        setFeed([]);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    requestGeolocationFeed();
  }, [fetchNearby, requestGeolocationFeed]);

  const canRetryLocation =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    Boolean(navigator.geolocation) &&
    Boolean(feedLoadError);

  const handleRetryLocationClick = () => {
    setFeedLoadError(null);
    setFeed(null);
    /* 재시도: 캐시 무시 + 고정밀(맥에서 Wi‑Fi 기반 고정이 조금 나아지는 경우가 있음) */
    requestGeolocationFeed({
      maximumAge: 0,
      enableHighAccuracy: true,
      timeout: 30000,
    });
  };

  return (
    <>
      {devGeoBypassNotice && (
        <div
          style={{
            position: "fixed",
            top: 8,
            left: 8,
            right: 8,
            zIndex: 9998,
            color: "#111",
            background: "rgba(255,214,120,0.95)",
            padding: "10px 12px",
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.35,
          }}
          role="status"
        >
          {devGeoBypassNotice}
        </div>
      )}
      {feedLoadError && (
        <div
          style={{
            position: "fixed",
            top: devGeoBypassNotice ? 72 : 8,
            left: 8,
            right: 8,
            zIndex: 9999,
            color: "#fff",
            background: "rgba(0,0,0,0.62)",
            padding: "10px 12px",
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.35,
          }}
          role="status"
        >
          <div style={{ whiteSpace: "pre-line" }}>{feedLoadError}</div>
          {canRetryLocation ? (
            <button
              type="button"
              onClick={handleRetryLocationClick}
              style={{
                marginTop: 8,
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                width: "100%",
              }}
            >
              위치 좌표 다시 받기
            </button>
          ) : null}
        </div>
      )}
      <Home
        feed={feed}
        focusPostId={focusPostId}
        feedEmptyDetail={
          feedLoadError
            ? "위치·네트워크를 확인해 주세요. (상단 안내 참고)"
            : null
        }
        onPullRefresh={refreshFeed}
        onCommentCreated={refreshFeed}
        onCommentSheetOpenChange={setCommentSheetOpen}
      />
      {!commentSheetOpen ? <BottomNav /> : null}
    </>
  );
}
