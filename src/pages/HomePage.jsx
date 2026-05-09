import { useCallback, useEffect, useState } from "react";
import { getFeed } from "../api/posts";
import BottomNav from "../components/BottomNav";
import Home from "../components/Home";

export default function HomePage() {
  const [feed, setFeed] = useState([]);
  const [feedLoadError, setFeedLoadError] = useState(null);
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);

  // TEMP: 로그인 미구현 상태라 홈 접근 가드는 잠시 비활성화
  // const { user } = useAuth();
  // if (!user) return <Navigate to="/login" replace />;

  useEffect(() => {
    let isMounted = true;

    const loadFeed = async () => {
      try {
        const data = await getFeed();
        if (!isMounted) return;
        setFeed(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!isMounted) return;
        console.error("Failed to load home feed:", error);
        setFeedLoadError("피드를 불러오지 못했습니다.");
        setFeed([]);
      }
    };

    loadFeed();
    return () => {
      isMounted = false;
    };
  }, []);

  const refreshFeed = useCallback(async () => {
    try {
      const data = await getFeed();
      setFeed(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to refresh feed:", error);
    }
  }, []);

  return (
    <>
      {feedLoadError && (
        <div
          style={{
            position: "fixed",
            top: 8,
            left: 8,
            zIndex: 9999,
            color: "#fff",
            background: "rgba(0,0,0,0.6)",
            padding: "6px 10px",
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {feedLoadError}
        </div>
      )}
      <Home
        feed={feed}
        onCommentSheetOpenChange={setCommentSheetOpen}
        onCommentCreated={refreshFeed}
      />
      {!commentSheetOpen && <BottomNav />}
    </>
  );
}
