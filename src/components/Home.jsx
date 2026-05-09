import { useEffect, useRef, useState } from "react";
import { checkCommentAccess } from "../api/comments";
import { toggleLike } from "../api/likes";
import { useAuth } from "../contexts/AuthContext";
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

/** Supabase 중첩 Comments: 배열 | 단일 행 | 없음. 삭제된 행(comment_deleted != null)은 제외 */
function commentsFromPost(post) {
  const raw = post?.Comments ?? post?.comments;
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter(
    (row) => row != null && row.comment_deleted == null,
  );
}

/** http://192.168… 등 비 HTTPS 개발: Geolocation 불가 → .env 로 고정 좌표만 허용 */
function getDevCommentCoordinates() {
  if (!import.meta.env.DEV) return null;
  const combined = import.meta.env.VITE_DEV_COMMENT_COORDS;
  if (typeof combined === "string" && combined.trim()) {
    const parts = combined.split(",").map((s) => Number(s.trim()));
    if (
      parts.length >= 2 &&
      Number.isFinite(parts[0]) &&
      Number.isFinite(parts[1])
    ) {
      return { lat: parts[0], lng: parts[1] };
    }
  }
  const lat = Number(import.meta.env.VITE_DEV_COMMENT_LAT);
  const lng = Number(import.meta.env.VITE_DEV_COMMENT_LNG);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
}

function Home({ feed = [], onCommentSheetOpenChange }) {
  const isLoading = feed.length === 0;
  const posts = isLoading ? [null] : feed;
  const [activeIndex, setActiveIndex] = useState(0);
  const [likeStateByPostId, setLikeStateByPostId] = useState({});
  const [commentSheetPost, setCommentSheetPost] = useState(null);
  const [commentSheetLoading, setCommentSheetLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const cardRefs = useRef([]);
  const feedScrollRef = useRef(null);
  const commentInputRef = useRef(null);
  const commentSheetRef = useRef(null);
  const commentSheetDragRef = useRef({
    active: false,
    pointerId: null,
    startY: 0,
    startTranslate: 0,
    lastOffset: 0,
  });
  const sheetTranslateYRef = useRef(0);
  const [sheetTranslateY, setSheetTranslateY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const [commentAccessBusy, setCommentAccessBusy] = useState(false);
  const { user } = useAuth();
  const likeUserId = user?.id ?? TEMP_LIKE_USER_ID;

  const composerAvatar =
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    "";

  useEffect(() => {
    onCommentSheetOpenChange?.(Boolean(commentSheetPost));
  }, [commentSheetPost, onCommentSheetOpenChange]);

  useEffect(() => {
    if (!commentSheetPost) return;
    setCommentSheetLoading(true);
    const id = window.setTimeout(() => setCommentSheetLoading(false), 480);
    return () => window.clearTimeout(id);
  }, [commentSheetPost?.post_id]);

  useEffect(() => {
    if (!commentSheetPost || commentSheetLoading) return;
    const t = window.setTimeout(() => commentInputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [commentSheetPost, commentSheetLoading]);

  useEffect(() => {
    sheetTranslateYRef.current = sheetTranslateY;
  }, [sheetTranslateY]);

  useEffect(() => {
    if (!commentSheetPost) {
      setSheetTranslateY(0);
      setSheetDragging(false);
      commentSheetDragRef.current.active = false;
    }
  }, [commentSheetPost]);

  const closeCommentSheet = () => {
    setCommentSheetPost(null);
    setCommentDraft("");
    setCommentSheetLoading(false);
    setSheetTranslateY(0);
    setSheetDragging(false);
  };

  const onCommentSheetHandlePointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const d = commentSheetDragRef.current;
    d.active = true;
    d.pointerId = e.pointerId;
    d.startY = e.clientY;
    d.startTranslate = sheetTranslateYRef.current;
    d.lastOffset = sheetTranslateYRef.current;
    setSheetDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCommentSheetHandlePointerMove = (e) => {
    const d = commentSheetDragRef.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    const next = Math.max(0, d.startTranslate + dy);
    d.lastOffset = next;
    setSheetTranslateY(next);
  };

  const endCommentSheetHandleDrag = (target, pointerId) => {
    const d = commentSheetDragRef.current;
    if (!d.active || d.pointerId !== pointerId) return;
    d.active = false;
    try {
      target.releasePointerCapture(pointerId);
    } catch {
      /* already released */
    }

    const offset = d.lastOffset ?? sheetTranslateYRef.current;
    const sheetH = commentSheetRef.current?.offsetHeight ?? 320;
    const threshold = Math.min(112, sheetH * 0.28);

    setSheetDragging(false);

    if (offset >= threshold) {
      closeCommentSheet();
      return;
    }

    requestAnimationFrame(() => setSheetTranslateY(0));
  };

  const onCommentSheetHandlePointerUp = (e) => {
    endCommentSheetHandleDrag(e.currentTarget, e.pointerId);
  };

  const onCommentSheetHandlePointerCancel = (e) => {
    const d = commentSheetDragRef.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    d.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    setSheetDragging(false);
    requestAnimationFrame(() => setSheetTranslateY(0));
  };

  const showCommentSheetForPost = (post) => {
    setCommentDraft("");
    setCommentSheetPost(post);
  };

  const tryOpenCommentSheet = (post) => {
    if (!post?.post_id || commentAccessBusy) return;

    const insecure =
      typeof window !== "undefined" && !window.isSecureContext;
    const devCoords = getDevCommentCoordinates();

    const runCommentAccessCheck = async (lat, lng) => {
      try {
        const result = await checkCommentAccess(post.post_id, lat, lng);

        if (result?.invokeError) {
          alert(
            "댓글을 조회할 수 없습니다. 네트워크 상태를 확인해 주세요.",
          );
          return;
        }

        if (result?.is_accessible) {
          showCommentSheetForPost(post);
        } else {
          const detail =
            typeof result?.message === "string" && result.message.trim()
              ? `\n\n${result.message.trim()}`
              : "";
          alert(`조회할 수 없습니다.${detail}`);
        }
      } catch {
        alert("댓글을 조회할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setCommentAccessBusy(false);
      }
    };

    /* 비 HTTPS(예: http://192.168…)에서는 브라우저가 Geolocation 자체를 막음 */
    if (insecure && devCoords) {
      setCommentAccessBusy(true);
      void runCommentAccessCheck(devCoords.lat, devCoords.lng);
      return;
    }

    if (insecure && !devCoords) {
      alert(
        "지금 주소가 HTTP(비보안)라서 브라우저가 위치 API를 사용하지 못합니다.\n\n" +
          "[개발] 폰에서 192.168… 로 테스트할 때는 프로젝트 루트에 .env.local 을 만들고:\n" +
          "  VITE_DEV_COMMENT_COORDS=위도,경도\n" +
          "예: VITE_DEV_COMMENT_COORDS=37.5665,126.9780\n" +
          "(저장 후 npm run dev 다시 실행)\n\n" +
          "[배포·실사용] HTTPS 또는 localhost 로 접속하면 실제 GPS를 씁니다.",
      );
      return;
    }

    if (!navigator.geolocation) {
      alert(
        "이 기기에서는 위치 정보를 사용할 수 없어 댓글을 조회할 수 없습니다.",
      );
      return;
    }

    setCommentAccessBusy(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await runCommentAccessCheck(
          pos.coords.latitude,
          pos.coords.longitude,
        );
      },
      (geoErr) => {
        setCommentAccessBusy(false);
        const code = geoErr?.code;
        if (code === 1) {
          alert(
            "이 사이트에 대한 위치 접근이 허용되지 않았습니다.\n\n" +
              "• 브라우저 주소창 자물쇠(ⓘ) → 사이트 설정 → 위치 → 허용\n" +
              "• 또는 주소창에 나온 위치 권한 창에서 ‘허용’을 선택했는지 확인해 주세요.\n" +
              "• Safari(iOS): 설정 → Safari → 위치 서비스에서 Safari 웹사이트 허용",
          );
        } else if (code === 2 || code === 3) {
          alert(
            "위치를 확인할 수 없어 댓글을 조회할 수 없습니다.",
          );
        } else {
          alert(
            "위치를 확인할 수 없어 댓글을 조회할 수 없습니다.",
          );
        }
      },
      {
        /* 목 위치(Fake GPS)·에뮬: 고정밀 모드는 실제 GNSS만 기다려 좌표가 안 넘어오는 경우가 많음 */
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 0,
      },
    );
  };

  const submitCommentDraft = () => {
    const text = commentDraft.trim();
    if (!text || !commentSheetPost?.post_id) return;
    // TODO: POST comment API 연결 시 여기서 전송
    setCommentDraft("");
    commentInputRef.current?.focus();
  };

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
            );
          })}
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
            className={`home-comment-sheet${sheetDragging ? " home-comment-sheet--dragging" : ""}`}
            style={{ transform: `translateY(${sheetTranslateY}px)` }}
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
            <div className="home-comment-scroll">
              {commentSheetLoading ? (
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
              ) : null}
            </div>
            <div className="home-comment-composer">
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
                  <span className="home-visually-hidden">댓글 작성하기</span>
                  <textarea
                    ref={commentInputRef}
                    className="home-comment-input"
                    rows={1}
                    placeholder="댓글 작성하기"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submitCommentDraft();
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="home-comment-send"
                  aria-label="보내기"
                  disabled={!commentDraft.trim()}
                  onClick={submitCommentDraft}
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
        </div>
      )}
    </section>
  );
}

export default Home;
