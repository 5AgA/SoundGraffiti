import { useEffect, useRef, useState } from "react";
import { toggleLike } from "../api/likes";
import { useAuth } from "../contexts/AuthContext";
import "./Home.css";

function Home({ feed = [] }) {
  const isLoading = feed.length === 0;
  const posts = isLoading ? [null] : feed;
  const [activeIndex, setActiveIndex] = useState(0);
  const [likeStateByPostId, setLikeStateByPostId] = useState({});
  const cardRefs = useRef([]);
  const feedScrollRef = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
    if (activeIndex > posts.length - 1) {
      setActiveIndex(0);
    }
  }, [activeIndex, posts.length]);

  const blurBackground = posts[activeIndex]?.Tracks?.album_image_url || "";

  const updateActiveFromScroll = (root) => {
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const centerY = rootRect.top + rootRect.height / 2;
    let bestIdx = 0;
    let bestDist = Infinity;
    posts.forEach((_, idx) => {
      const node = cardRefs.current[idx];
      if (!node) return;
      const r = node.getBoundingClientRect();
      const cardMidY = r.top + r.height / 2;
      const dist = Math.abs(cardMidY - centerY);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    setActiveIndex((prev) => (prev !== bestIdx ? bestIdx : prev));
  };

  const handleFeedScroll = (e) => {
    updateActiveFromScroll(e.currentTarget);
  };

  useEffect(() => {
    const root = feedScrollRef.current;
    if (!root) return;
    updateActiveFromScroll(root);
  }, [posts.length]);

  const handleLikeToggle = async (post) => {
    const postId = post?.post_id;
    const userId = user?.id;
    if (!postId || !userId) return;

    const likes = Array.isArray(post?.Likes) ? post.Likes : [];
    const serverLiked = likes.some((like) => like?.user_id === userId);
    const serverCount = likes.length;
    const currentState = likeStateByPostId[postId];
    const isLiked = currentState?.liked ?? serverLiked;
    const likeCount = currentState?.count ?? serverCount;
    const nextLiked = !isLiked;
    const nextCount = Math.max(0, likeCount + (nextLiked ? 1 : -1));

    // Optimistic UI update: 아이콘/카운트 즉시 반영
    setLikeStateByPostId((prev) => ({
      ...prev,
      [postId]: { liked: nextLiked, count: nextCount, pending: true },
    }));

    const result = await toggleLike(postId, userId);
    if (result?.error) {
      setLikeStateByPostId((prev) => ({
        ...prev,
        [postId]: { liked: isLiked, count: likeCount, pending: false },
      }));
      return;
    }

    setLikeStateByPostId((prev) => ({
      ...prev,
      [postId]: { liked: nextLiked, count: nextCount, pending: false },
    }));
  };

  return (
    <section className="home-wrap">
      <div className="home-phone">
        <div className="home-bg-stack">
          <div
            className={`home-bg-blur${blurBackground ? "" : " no-image"}`}
            style={
              blurBackground
                ? { backgroundImage: `url(${blurBackground})` }
                : undefined
            }
          />
          <div
            className="home-bg-edge-fade home-bg-edge-fade--top"
            aria-hidden
          />
        </div>
        <div className="home-top-fade" />

        <header className="home-header">
          <img
            className="home-logo"
            src="/Soundgraffiti.svg"
            alt="Soundgraffiti"
          />
        </header>

        <div
          className="home-feed-scroll"
          ref={feedScrollRef}
          onScroll={handleFeedScroll}
        >
          {posts.map((post, idx) => {
            const isSkeleton = isLoading;
            const albumArt = post?.Tracks?.album_image_url || "";
            const userData = Array.isArray(post?.Users)
              ? post.Users[0]
              : post?.Users;
            // Avatar는 user_profile_url을 최우선으로 사용
            const avatar =
              userData?.user_profile_url ||
              post?.user_profile_url ||
              userData?.profile_image_url ||
              post?.profile_image_url ||
              "";
            const userName = userData?.user_name || "annonymous";
            const placeName = post?.Places?.place_name || "서울 홍대입구역";
            const content =
              post?.content ||
              "이 공간에는 르세라핌 'Spaghetti'처럼 텐션 있는 음악이 어울려요.";
            const likes = Array.isArray(post?.Likes) ? post.Likes : [];
            const postId = post?.post_id;
            const serverLiked = likes.some(
              (like) => like?.user_id === user?.id,
            );
            const localLikeState = postId ? likeStateByPostId[postId] : null;
            const likeCount = localLikeState?.count ?? likes.length ?? 12;
            const isLiked = localLikeState?.liked ?? serverLiked;
            const isLikePending = localLikeState?.pending ?? false;
            const isActive = idx === activeIndex;

            return (
              <article
                className={`home-card${isActive ? " home-card--active" : ""}`}
                key={post?.post_id || idx}
                ref={(el) => {
                  cardRefs.current[idx] = el;
                }}
              >
                {isSkeleton ? (
                  <div className="home-card-image home-card-image-skeleton" />
                ) : albumArt ? (
                  <img
                    className="home-card-image"
                    src={albumArt}
                    alt={placeName}
                  />
                ) : (
                  <div className="home-card-image home-card-image-empty" />
                )}
                {isActive && (
                  <>
                    <div className="home-card-top-shadow" />
                    <div className="home-card-bottom-shadow" />

                    {isSkeleton ? (
                      <>
                        <div className="home-user">
                          <div className="home-avatar home-skeleton home-skeleton-avatar" />
                          <div className="home-skeleton-user-lines">
                            <div className="home-skeleton home-skeleton-name" />
                            <div className="home-skeleton home-skeleton-place" />
                          </div>
                        </div>

                        <div className="home-content home-skeleton-content-wrap">
                          <div className="home-skeleton home-skeleton-content-1" />
                          <div className="home-skeleton home-skeleton-content-2" />
                        </div>

                        <div className="home-actions">
                          <div className="home-skeleton home-skeleton-action home-skeleton-action-1" />
                          <div className="home-skeleton home-skeleton-action home-skeleton-action-2" />
                          <div className="home-skeleton home-skeleton-action home-skeleton-action-3" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="home-user">
                          {avatar ? (
                            <img
                              className="home-avatar"
                              src={avatar}
                              alt={userName}
                            />
                          ) : (
                            <div className="home-avatar" />
                          )}
                          <div>
                            <p className="home-name">{userName}</p>
                            <p className="home-place">{placeName}</p>
                          </div>
                        </div>

                        <p className="home-content">{content}</p>

                        <div className="home-actions">
                          <button
                            type="button"
                            className="home-action-btn"
                            onClick={() => handleLikeToggle(post)}
                            disabled={isLikePending}
                          >
                            <img
                              className="home-action-icon"
                              src={isLiked ? "/heart.fill.svg" : "/heart.empty.svg"}
                              alt=""
                              aria-hidden="true"
                            />
                            <span>{likeCount}</span>
                          </button>
                          <button type="button" className="home-action-btn">
                            <img
                              className="home-action-icon"
                              src="/bubble.fill.svg"
                              alt=""
                              aria-hidden="true"
                            />
                            <span>5</span>
                          </button>
                          <button type="button" className="home-action-btn">
                            <img
                              className="home-action-icon home-action-icon--spotify"
                              src="/spotify.btn.svg"
                              alt="Spotify"
                            />
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Home;
