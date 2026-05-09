import { useCallback, useEffect, useRef, useState } from "react";
import { getNearbyPosts } from "../api/posts";
import BottomNav from "../components/BottomNav";
import Home from "../components/Home";
import { getDevGeoCoordinates } from "../utils/devGeoCoords";

export default function HomePage() {
  /** null = 로딩 중, 배열 = 주변 피드 결과(빈 배열 가능) */
  const [feed, setFeed] = useState(null);
  const [feedLoadError, setFeedLoadError] = useState(null);

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

  const fetchNearby = async (lat, lng) => {
    coordsRef.current = { lat, lng };
    const { posts, error } = await getNearbyPosts(lat, lng);
    applyPostsResult(posts, error);
  };

  const refreshFeed = useCallback(async () => {
    const c = coordsRef.current;
    if (!c) return;
    const { posts, error } = await getNearbyPosts(c.lat, c.lng);
    applyPostsResult(posts, error);
  }, []);

  useEffect(() => {
    const insecure =
      typeof window !== "undefined" && !window.isSecureContext;
    const devCoords = getDevGeoCoordinates();

    if (insecure && devCoords) {
      void fetchNearby(devCoords.lat, devCoords.lng);
      return;
    }

    if (insecure && !devCoords) {
      setFeedLoadError(
        "HTTP(비보안)에서는 위치 API를 쓸 수 없습니다. .env.local 에 VITE_DEV_GEO_COORDS=위도,경도 를 넣고 dev 서버를 다시 실행해 주세요.",
      );
      setFeed([]);
      return;
    }

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
      },
    );
  }, []);

  return (
    <>
      {feedLoadError && (
        <div
          style={{
            position: "fixed",
            top: 8,
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
          {feedLoadError}
        </div>
      )}
      <Home
        feed={feed}
        feedEmptyDetail={
          feedLoadError
            ? "위치·네트워크를 확인해 주세요. (상단 안내 참고)"
            : null
        }
        onPullRefresh={refreshFeed}
      />
      <BottomNav />
    </>
  );
}
