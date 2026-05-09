import { useEffect, useRef, useState } from "react";
import { toggleLike } from "../api/likes";
import { useAuth } from "../contexts/AuthContext";
import { resolvedProfileImageUrl } from "../utils/profileImage";
import "./Home.css";

const TEMP_LIKE_USER_ID = 1;
/** 스크롤 스냅 때문에 첫 카드일 때도 scrollTop ≠ 0 — 두 번째 카드 기준으로 ‘첫 카드 구간’ 판별 */
const PTR_ARM_SCROLL_SLACK_PX = 28;
/** 이 거리 이상 아래로 누적되면 새로고침 전에 로딩 힌트 표시 */
const PULL_HINT_ACCUM_PX = 26;

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

/** Tracks 단일 행 | 배열 */
function trackFromPost(post) {
  const raw = post?.Tracks ?? post?.tracks;
  if (raw == null) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

/** feed 가 null 이면 로딩 중, 배열이면 로딩 완료(빈 배열 가능) */
function Home({ feed = null, feedEmptyDetail = null, onPullRefresh }) {
  const isLoading = feed === null;
  const list = isLoading ? [null] : feed;
  const [activeIndex, setActiveIndex] = useState(0);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedPullHint, setFeedPullHint] = useState(false);
  const [likeStateByPostId, setLikeStateByPostId] = useState({});
  const cardRefs = useRef([]);
  const feedScrollRef = useRef(null);
  const activeIndexRef = useRef(0);
  const ptrArmMaxScrollTopRef = useRef(Number.POSITIVE_INFINITY);
  const refreshCooldownUntilRef = useRef(0);
  const { user } = useAuth();

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);
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
    const cs = getComputedStyle(root);
    const padTop = parseFloat(cs.scrollPaddingTop) || 0;
    const padBottom = parseFloat(cs.scrollPaddingBottom) || 0;
    const inner = Math.max(0, rootRect.height - padTop - padBottom);
    const centerY = rootRect.top + padTop + inner / 2;
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

  useEffect(() => {
    const root = feedScrollRef.current;
    if (!root || feed === null) return;

    const measureArm = () => {
      const items = cardRefs.current;
      const second = items[1];
      if (!second) {
        ptrArmMaxScrollTopRef.current = Number.POSITIVE_INFINITY;
        return;
      }
      const vh = root.clientHeight;
      ptrArmMaxScrollTopRef.current = Math.max(
        80,
        second.offsetTop - Math.round(vh * 0.42),
      );
    };

    requestAnimationFrame(() => requestAnimationFrame(measureArm));
    const ro = new ResizeObserver(measureArm);
    ro.observe(root);
    window.addEventListener("orientationchange", measureArm);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", measureArm);
    };
  }, [feed, list.length]);

  useEffect(() => {
    const el = feedScrollRef.current;
    if (!el || feed === null || typeof onPullRefresh !== "function") return;

    const armSlack = PTR_ARM_SCROLL_SLACK_PX;
    const cooldownMs = 1600;

    const onFirstCard = () =>
      activeIndexRef.current === 0 &&
      el.scrollTop <= ptrArmMaxScrollTopRef.current + armSlack;

    const runRefresh = () => {
      if (!onFirstCard()) return;
      if (Date.now() < refreshCooldownUntilRef.current) return;
      refreshCooldownUntilRef.current = Date.now() + cooldownMs;
      setFeedPullHint(false);
      setFeedRefreshing(true);
      void Promise.resolve(onPullRefresh()).finally(() => {
        setFeedRefreshing(false);
        requestAnimationFrame(() => {
          const r = feedScrollRef.current;
          if (r) r.scrollTop = 0;
        });
      });
    };

    /* 이전 피드 방향 휠 후 scrollTop이 거의 안 줄었으면 막힌 상태 → 새로고침 */
    const onWheel = (e) => {
      if (!onFirstCard()) return;
      if (e.deltaY >= -10) return;
      const before = el.scrollTop;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!onFirstCard()) return;
          if (el.scrollTop > before - 4) runRefresh();
        });
      });
    };

    let touchArm = false;
    let touchLastY = null;
    let touchDownAccum = 0;
    let scrollTopTouchStart = 0;
    let pullHintLatched = false;

    const hidePullHint = () => {
      pullHintLatched = false;
      setFeedPullHint(false);
    };

    const maybeShowPullHint = () => {
      if (pullHintLatched || touchDownAccum < PULL_HINT_ACCUM_PX) return;
      pullHintLatched = true;
      setFeedPullHint(true);
    };

    const resetTouchGesture = () => {
      touchArm = false;
      touchLastY = null;
      touchDownAccum = 0;
      scrollTopTouchStart = 0;
    };

    const resetTouch = () => {
      resetTouchGesture();
      hidePullHint();
    };

    const onTouchStart = (ev) => {
      hidePullHint();
      if (!onFirstCard()) {
        resetTouchGesture();
        return;
      }
      touchArm = true;
      touchLastY = ev.touches[0].clientY;
      touchDownAccum = 0;
      scrollTopTouchStart = el.scrollTop;
    };

    const onTouchMove = (ev) => {
      if (!touchArm || touchLastY == null) return;
      const y = ev.touches[0].clientY;
      const step = y - touchLastY;
      if (step > 0) touchDownAccum += step;
      touchLastY = y;
      maybeShowPullHint();
    };

    const onTouchEnd = () => {
      if (!touchArm) return;
      const stDelta = Math.abs(el.scrollTop - scrollTopTouchStart);
      const ok =
        touchDownAccum >= 76 &&
        onFirstCard() &&
        stDelta < 22;
      resetTouchGesture();
      hidePullHint();
      if (ok) runRefresh();
    };

    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", resetTouch);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", resetTouch);
      setFeedPullHint(false);
    };
  }, [feed, onPullRefresh]);

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

  const handleLogoGoTop = () => {
    const root = feedScrollRef.current;
    if (!root) return;
    root.scrollTo({ top: 0, behavior: "smooth" });
    setActiveIndex(0);
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
          <button
            type="button"
            className="home-logo-btn"
            onClick={handleLogoGoTop}
            aria-label="피드 맨 위로 이동"
          >
            <img
              className="home-logo"
              src="/Soundgraffiti.svg"
              alt=""
              draggable={false}
            />
          </button>
        </header>

        {feedRefreshing || feedPullHint ? (
          <div
            className={`home-feed-refresh-overlay${feedPullHint && !feedRefreshing ? " home-feed-refresh-overlay--pull" : ""}`}
            role="status"
            aria-live="polite"
            aria-label={
              feedRefreshing
                ? "피드를 새로고침하는 중"
                : "새로고침을 놓으면 불러옵니다"
            }
          >
            <div className="home-feed-refresh-spinner" aria-hidden />
          </div>
        ) : null}

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
            const track = !isSkeleton ? trackFromPost(post) : null;
            const trackTitle =
              typeof track?.track_title === "string"
                ? track.track_title.trim()
                : "";
            const artistName =
              typeof track?.artist_name === "string"
                ? track.artist_name.trim()
                : "";

            return (
              <div
                className={`home-feed-item${!isSkeleton && idx < activeIndex ? " home-feed-item--past" : ""}`}
                key={post?.post_id || idx}
                ref={(el) => {
                  cardRefs.current[idx] = el;
                }}
                aria-hidden={!isSkeleton && idx < activeIndex}
              >
                <div className="home-feed-item-track-slot">
                  {isActive && isSkeleton ? (
                    <div className="home-track-meta home-track-meta--above home-track-meta--skel">
                      <div className="home-track-skel-title" />
                      <div className="home-track-skel-artist" />
                    </div>
                  ) : null}
                  {isActive && !isSkeleton && (trackTitle || artistName) ? (
                    <div className="home-track-meta home-track-meta--above">
                      {trackTitle ? (
                        <p className="home-track-title">{trackTitle}</p>
                      ) : null}
                      {artistName ? (
                        <p className="home-track-artist">{artistName}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <article
                  className={`home-card${isActive ? " home-card--active" : ""}`}
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
              </div>
            );
          })}
          {isLoading || list.length > 0 ? (
            <div className="home-feed-scroll-tail" aria-hidden />
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default Home;
