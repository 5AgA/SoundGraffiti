import { useEffect, useRef, useState } from "react";
import { toggleLike } from "../api/likes";
import { useAuth } from "../contexts/AuthContext";
import { resolvedProfileImageUrl } from "../utils/profileImage";
import "./Home.css";

const TEMP_LIKE_USER_ID = 1;

/** Supabase 중첩 Likes: 배열 | 단일 행 | 없음 */
function likesFromPost(post) {
  const raw = post?.Likes ?? post?.likes;
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function userMatchesLike(like, userId) {
  if (userId == null || like?.user_id == null) return false;
  return String(like.user_id) === String(userId);
}

/** Supabase 중첩 Comments: 배열 | 단일 행 | 없음 */
function commentsFromPost(post) {
  const raw = post?.Comments ?? post?.comments;
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** feed 가 null 이면 로딩 중, 배열이면 로딩 완료(빈 배열 가능) */
function Home({ feed = null, feedEmptyDetail = null }) {
  const isLoading = feed === null;
  const list = isLoading ? [null] : feed;
  const [activeIndex, setActiveIndex] = useState(0);
  const [likeStateByPostId, setLikeStateByPostId] = useState({});
  const cardRefs = useRef([]);
  const feedScrollRef = useRef(null);
  const { user } = useAuth();
  const likeUserId = user?.id ?? TEMP_LIKE_USER_ID;

  useEffect(() => {
    if (activeIndex > list.length - 1) {
      setActiveIndex(0);
    }
  }, [activeIndex, list.length]);

  const blurBackground = list[activeIndex]?.Tracks?.album_image_url || "";

  const updateActiveFromScroll = (root) => {
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const centerY = rootRect.top + rootRect.height / 2;
    let bestIdx = 0;
    let bestDist = Infinity;
    list.forEach((_, idx) => {
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
  }, [list.length]);

  const handleLikeToggle = async (post) => {
    const postId = post?.post_id;
    const userId = likeUserId;
    if (!postId || !userId) return;

    const likes = likesFromPost(post);
    const serverLiked = likes.some((like) => userMatchesLike(like, userId));
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
          {!isLoading && list.length === 0 ? (
            <p className="home-feed-empty" role="status">
              {feedEmptyDetail ??
                "주변 200m 안에 포스트가 없어요."}
            </p>
          ) : null}
          {list.map((post, idx) => {
            const isSkeleton = isLoading;
            const albumArt = post?.Tracks?.album_image_url || "";
            const userData = Array.isArray(post?.Users)
              ? post.Users[0]
              : post?.Users;
            const avatarRaw =
              userData?.user_profile_url ||
              post?.user_profile_url ||
              userData?.profile_image_url ||
              post?.profile_image_url ||
              "";
            const avatarSrc = resolvedProfileImageUrl(avatarRaw);
            const userName = userData?.user_name || "annonymous";
            const placeName = post?.Places?.place_name || "서울 홍대입구역";
            const content =
              post?.content ||
              "이 공간에는 르세라핌 'Spaghetti'처럼 텐션 있는 음악이 어울려요.";
            const likes = likesFromPost(post);
            const postId = post?.post_id;
            const serverLiked = likes.some((like) =>
              userMatchesLike(like, likeUserId),
            );
            const localLikeState =
              postId != null ? likeStateByPostId[postId] : null;
            const serverLikeCount = likes.length;
            const likeCount =
              typeof localLikeState?.count === "number"
                ? localLikeState.count
                : serverLikeCount;
            const isLiked = localLikeState?.liked ?? serverLiked;
            const isLikePending = localLikeState?.pending ?? false;
            const commentCount = commentsFromPost(post).length;
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
                          <img
                            className="home-avatar"
                            src={avatarSrc}
                            alt={userName}
                          />
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
                            <span>{commentCount}</span>
                          </button>
                          <button
                            type="button"
                            className="home-action-btn home-action-btn--spotify"
                          >
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
