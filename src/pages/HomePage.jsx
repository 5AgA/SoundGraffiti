import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getNearbyPosts } from "../api/posts";
import BottomNav from "../components/BottomNav";
import Home from "../components/Home";
import { getDevGeoCoordinates } from "../utils/devGeoCoords";

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
        () => {
          if (!isMountedRef.current) return;
          setFeedLoadError(
            "위치를 허용해야 주변 피드를 불러올 수 있습니다. 브라우저 설정에서 위치 권한을 확인해 주세요.",
          );
          setFeed([]);
        },
        {
          enableHighAccuracy: false,
          timeout: 15000,
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
    requestGeolocationFeed({ maximumAge: 0 });
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
          <div>{feedLoadError}</div>
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
              위치 다시 요청 (탭하면 권한 창이 뜰 수 있습니다)
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
