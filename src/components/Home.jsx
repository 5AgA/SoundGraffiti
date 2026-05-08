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
    <section className="homev1-wrap">
      <div className="homev1-phone">
        <div className="homev1-bg-stack">
          <div
            className={`homev1-bg-blur${blurBackground ? "" : " no-image"}`}
            style={
              blurBackground
                ? { backgroundImage: `url(${blurBackground})` }
                : undefined
            }
          />
          <div
            className="homev1-bg-edge-fade homev1-bg-edge-fade--top"
            aria-hidden
          />
        </div>
        <div className="homev1-top-fade" />

        <header className="homev1-header">
          <img
            className="homev1-logo"
            src="/Soundgraffiti.svg"
            alt="Soundgraffiti"
          />
        </header>

        <div
          className="homev1-feed-scroll"
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
                className={`homev1-card${isActive ? " homev1-card--active" : ""}`}
                key={post?.post_id || idx}
                ref={(el) => {
                  cardRefs.current[idx] = el;
                }}
              >
                {isSkeleton ? (
                  <div className="homev1-card-image homev1-card-image-skeleton" />
                ) : albumArt ? (
                  <img
                    className="homev1-card-image"
                    src={albumArt}
                    alt={placeName}
                  />
                ) : (
                  <div className="homev1-card-image homev1-card-image-empty" />
                )}
                {isActive && (
                  <>
                    <div className="homev1-card-top-shadow" />
                    <div className="homev1-card-bottom-shadow" />

                    {isSkeleton ? (
                      <>
                        <div className="homev1-user">
                          <div className="homev1-avatar homev1-skeleton homev1-skeleton-avatar" />
                          <div className="homev1-skeleton-user-lines">
                            <div className="homev1-skeleton homev1-skeleton-name" />
                            <div className="homev1-skeleton homev1-skeleton-place" />
                          </div>
                        </div>

                        <div className="homev1-content homev1-skeleton-content-wrap">
                          <div className="homev1-skeleton homev1-skeleton-content-1" />
                          <div className="homev1-skeleton homev1-skeleton-content-2" />
                        </div>

                        <div className="homev1-actions">
                          <div className="homev1-skeleton homev1-skeleton-action homev1-skeleton-action-1" />
                          <div className="homev1-skeleton homev1-skeleton-action homev1-skeleton-action-2" />
                          <div className="homev1-skeleton homev1-skeleton-action homev1-skeleton-action-3" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="homev1-user">
                          {avatar ? (
                            <img
                              className="homev1-avatar"
                              src={avatar}
                              alt={userName}
                            />
                          ) : (
                            <div className="homev1-avatar" />
                          )}
                          <div>
                            <p className="homev1-name">{userName}</p>
                            <p className="homev1-place">{placeName}</p>
                          </div>
                        </div>

                        <p className="homev1-content">{content}</p>

                        <div className="homev1-actions">
                          <button
                            type="button"
                            className="homev1-action-btn"
                            onClick={() => handleLikeToggle(post)}
                            disabled={isLikePending}
                          >
                            <img
                              className="homev1-action-icon"
                              src={isLiked ? "/heart.fill.svg" : "/heart.empty.svg"}
                              alt=""
                              aria-hidden="true"
                            />
                            <span>{likeCount}</span>
                          </button>
                          <button type="button" className="homev1-action-btn">
                            <img
                              className="homev1-action-icon"
                              src="/bubble.fill.svg"
                              alt=""
                              aria-hidden="true"
                            />
                            <span>5</span>
                          </button>
                          <button type="button" className="homev1-action-btn">
                            <img
                              className="homev1-action-icon homev1-action-icon--spotify"
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

        <nav className="homev1-nav">
          <span className="is-active">
            <img
              className="homev1-nav-home-icon"
              src="/house.fill.svg"
              alt="Home"
            />
          </span>
          <span>
            <img className="homev1-nav-map-icon" src="/map.svg" alt="Map" />
          </span>
          <span>
            <img
              className="homev1-nav-person-icon"
              src="/person.svg"
              alt="Profile"
            />
          </span>
        </nav>
        <button type="button" className="homev1-fab">
          +
        </button>
      </div>
    </section>
  );
}

export default Home;
