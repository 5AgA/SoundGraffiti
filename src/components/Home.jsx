import { useEffect, useMemo, useRef, useState } from "react";
import {
  checkCommentAccess,
  createComment,
  deleteComment,
} from "../api/comments";
import { toggleLike } from "../api/likes";
import { useAuth } from "../contexts/AuthContext";
import { resolvedProfileImageUrl } from "../utils/profileImage";
import "./Home.css";

/** Auth 컨텍스트 없을 때 폴백 (FIXED_APP_USER_ID 와 동일) */
const TEMP_LIKE_USER_ID = 3;
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

/** Supabase 중첩 Comments: 배열 | 단일 행 | 없음. 삭제된 행(comment_deleted != null)은 제외 */
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
  const [commentSheetPost, setCommentSheetPost] = useState(null);
  /** 위치·반경 확인 전에는 스켈레톤만 보이고 입력 비활성 */
  const [commentSheetAccessPending, setCommentSheetAccessPending] =
    useState(false);
  const commentSheetPostRef = useRef(null);
  const [commentDraft, setCommentDraft] = useState("");
  const cardRefs = useRef([]);
  const feedScrollRef = useRef(null);
  const activeIndexRef = useRef(0);
  const ptrArmMaxScrollTopRef = useRef(Number.POSITIVE_INFINITY);
  const refreshCooldownUntilRef = useRef(0);
  const commentInputRef = useRef(null);
  const commentScrollRef = useRef(null);
  const commentSheetRef = useRef(null);
  const commentSheetDragRef = useRef({
    active: false,
    pointerId: null,
    startY: 0,
    startTranslate: 0,
    lastOffset: 0,
    lastClientY: 0,
    /** 접힘 상태에서 한 번의 제스처 동안 가장 위로 당긴 dy(음수일수록 상향) */
    bestDy: 0,
    /** 접힘 상태에서 손가락이 도달한 가장 위쪽 clientY (작을수록 화면 상단) */
    minClientY: 0,
    /** 접힘 상태에서 아래로 당긴 거리 (닫기 전 높이 줄임용) */
    lastStretchDown: 0,
    /** 확장 상태에서 드래그 시작 시 시트 높이(px) */
    expandDragStartHeight: null,
  });
  const commentLongPressRef = useRef({
    timer: null,
    pointerId: null,
    startX: 0,
    startY: 0,
  });

  const flushCommentLongPressTimer = () => {
    const lp = commentLongPressRef.current;
    if (lp.timer != null) window.clearTimeout(lp.timer);
    lp.timer = null;
    lp.pointerId = null;
  };

  const sheetTranslateYRef = useRef(0);
  const [sheetTranslateY, setSheetTranslateY] = useState(0);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetExpandedRef = useRef(false);
  const [sheetDragging, setSheetDragging] = useState(false);
  /** peek 에서 위로 당겨 늘리는 동안만 픽셀 높이 직접 지정 (아래는 화면에 고정) */
  const [sheetInteractiveHeightPx, setSheetInteractiveHeightPx] =
    useState(null);
  const [commentAccessBusy, setCommentAccessBusy] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [pendingSheetComments, setPendingSheetComments] = useState([]);
  /** 답글 작성 대상 (하단 입력창에 parent_comment_id 로 전달) */
  const [commentReplyTarget, setCommentReplyTarget] = useState(null);
  /** 삭제 직후 피드 갱신 전까지 목록에서만 숨김 */
  const [removedSheetCommentIds, setRemovedSheetCommentIds] = useState([]);
  const [commentDeletePrompt, setCommentDeletePrompt] = useState(null);
  const [commentDeleteSubmitting, setCommentDeleteSubmitting] = useState(false);
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
      const ok = touchDownAccum >= 76 && onFirstCard() && stDelta < 22;
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
              {feedEmptyDetail ?? "주변 200m 안에 포스트가 없어요."}
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
                                src={
                                  isLiked
                                    ? "/heart.fill.svg"
                                    : "/heart.empty.svg"
                                }
                                alt=""
                                aria-hidden="true"
                              />
                              <span>{likeCount}</span>
                            </button>
                            <button
                              type="button"
                              className="home-action-btn"
                              onClick={() => tryOpenCommentSheet(post)}
                              disabled={commentAccessBusy}
                              aria-label="댓글 작성"
                            >
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

      {commentSheetPost && (
        <div
          className="home-comment-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-comment-sheet-title"
        >
          <button
            type="button"
            className="home-comment-backdrop"
            aria-label="닫기"
            onClick={closeCommentSheet}
          />
          <div
            ref={commentSheetRef}
            className={`home-comment-sheet${sheetDragging ? " home-comment-sheet--dragging" : ""}${sheetExpanded ? " home-comment-sheet--expanded" : ""}`}
            style={{
              transform: `translateY(${sheetTranslateY}px)`,
              ...(sheetInteractiveHeightPx != null
                ? {
                    height: `${sheetInteractiveHeightPx}px`,
                    maxHeight: `${sheetInteractiveHeightPx}px`,
                    "--comment-sheet-h": `${sheetInteractiveHeightPx}px`,
                  }
                : {}),
            }}
          >
            <div
              className="home-comment-handle-zone"
              onPointerDown={onCommentSheetHandlePointerDown}
              onPointerMove={onCommentSheetHandlePointerMove}
              onPointerUp={onCommentSheetHandlePointerUp}
              onPointerCancel={onCommentSheetHandlePointerCancel}
            >
              <div className="home-comment-handle" aria-hidden />
            </div>
            <h2 id="home-comment-sheet-title" className="home-visually-hidden">
              댓글
            </h2>
            <div className="home-comment-scroll" ref={commentScrollRef}>
              {commentSheetAccessPending ? (
                <>
                  <p className="home-visually-hidden" aria-live="polite">
                    위치와 접근 가능 여부를 확인하는 중입니다.
                  </p>
                  <ul className="home-comment-skel-list" aria-hidden>
                    {[0, 1, 2].map((key) => (
                      <li key={key} className="home-comment-skel-row">
                        <div className="home-comment-skel-avatar" />
                        <div className="home-comment-skel-main">
                          <div className="home-comment-skel-line home-comment-skel-line--name" />
                          <div className="home-comment-skel-line home-comment-skel-line--body" />
                        </div>
                        <div className="home-comment-skel-side">
                          <div className="home-comment-skel-line home-comment-skel-line--meta" />
                          <div className="home-comment-skel-line home-comment-skel-line--meta2" />
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : sheetCommentsThread.length > 0 ? (
                <ul className="home-comment-thread">
                  {sheetCommentsThread.map(({ row, depth }) => {
                    const u = commentUserFromRow(row);
                    const name = u.user_name || "사용자";
                    const avatar = u.user_profile_url || "";
                    const key = row.comment_id;
                    const indentPx = depth > 0 ? Math.min(depth, 8) * 52 : 0;
                    const ownRow = isOwnSheetComment(row, likeUserId);
                    return (
                      <li
                        key={key}
                        className={`home-comment-item${depth > 0 ? " home-comment-item--nested" : ""}${ownRow ? " home-comment-item--own" : ""}`}
                        style={
                          indentPx > 0
                            ? { marginLeft: `${indentPx}px` }
                            : undefined
                        }
                        onPointerDown={
                          ownRow ? handleCommentRowPointerDown(row) : undefined
                        }
                        onPointerMove={
                          ownRow ? handleCommentRowPointerMove : undefined
                        }
                        onPointerUp={
                          ownRow ? handleCommentRowPointerEnd : undefined
                        }
                        onPointerCancel={
                          ownRow ? handleCommentRowPointerEnd : undefined
                        }
                        onTouchStart={
                          ownRow ? handleCommentRowTouchStart(row) : undefined
                        }
                        onTouchMove={
                          ownRow ? handleCommentRowTouchMove : undefined
                        }
                        onTouchEnd={
                          ownRow ? handleCommentRowTouchEndOrCancel : undefined
                        }
                        onTouchCancel={
                          ownRow ? handleCommentRowTouchEndOrCancel : undefined
                        }
                        onContextMenu={
                          ownRow ? handleOwnCommentContextMenu(row) : undefined
                        }
                      >
                        {avatar ? (
                          <img
                            className="home-comment-item__avatar"
                            src={avatar}
                            alt=""
                          />
                        ) : (
                          <div className="home-comment-item__avatar home-comment-item__avatar--empty" />
                        )}
                        <div className="home-comment-item__main">
                          <p className="home-comment-item__name">{name}</p>
                          <p className="home-comment-item__text">
                            {row.content}
                          </p>
                        </div>
                        <div className="home-comment-item__aside">
                          <span className="home-comment-item__time">
                            {formatSheetCommentTime(row.comment_created)}
                          </span>
                          <button
                            type="button"
                            className="home-comment-item__reply"
                            onPointerDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            onClick={() => startReplyToComment(row)}
                            disabled={commentSheetAccessPending}
                          >
                            답글 달기
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <div className="home-comment-composer">
              {commentReplyTarget ? (
                <div className="home-comment-reply-bar">
                  <p className="home-comment-reply-bar__label">
                    <span className="home-comment-reply-bar__name">
                      {commentReplyTarget.name}
                    </span>
                    님에게 답글
                  </p>
                  <button
                    type="button"
                    className="home-comment-reply-bar__cancel"
                    aria-label="답글 대상 취소"
                    onClick={clearCommentReplyTarget}
                  >
                    취소
                  </button>
                </div>
              ) : null}
              <div className="home-comment-composer-inner">
                {composerAvatar ? (
                  <img
                    className="home-comment-composer-avatar"
                    src={composerAvatar}
                    alt=""
                  />
                ) : (
                  <div className="home-comment-composer-avatar home-comment-composer-avatar--empty" />
                )}
                <label className="home-comment-input-wrap">
                  <span className="home-visually-hidden">
                    {commentReplyTarget ? "답글 작성하기" : "댓글 작성하기"}
                  </span>
                  <textarea
                    ref={commentInputRef}
                    className="home-comment-input"
                    rows={1}
                    placeholder={
                      commentReplyTarget ? "답글 작성하기" : "댓글 작성하기"
                    }
                    disabled={commentSheetAccessPending}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submitCommentDraft();
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="home-comment-send"
                  aria-label="보내기"
                  disabled={
                    commentSheetAccessPending ||
                    !commentDraft.trim() ||
                    commentSubmitting
                  }
                  onClick={() => void submitCommentDraft()}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M5 12h14M13 5l7 7-7 7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          {commentDeletePrompt ? (
            <div className="home-comment-delete-layer">
              <button
                type="button"
                className="home-comment-delete-layer__backdrop"
                aria-label="취소"
                onClick={dismissCommentDeletePrompt}
              />
              <div
                className="home-comment-delete-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="home-comment-delete-title"
              >
                <p
                  id="home-comment-delete-title"
                  className="home-comment-delete-dialog__title"
                >
                  삭제 하시겠습니까?
                </p>
                <div className="home-comment-delete-dialog__actions">
                  <button
                    type="button"
                    className="home-comment-delete-dialog__btn home-comment-delete-dialog__btn--ghost"
                    onClick={dismissCommentDeletePrompt}
                    disabled={commentDeleteSubmitting}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="home-comment-delete-dialog__btn home-comment-delete-dialog__btn--danger"
                    onClick={() => void confirmCommentDelete()}
                    disabled={commentDeleteSubmitting}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

export default Home;
