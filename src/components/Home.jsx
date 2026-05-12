import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  checkCommentAccess,
  createComment,
  deleteComment,
} from "../api/comments";
import { toggleLike } from "../api/likes";
import { getUserById } from "../api/users";
import { useAuth } from "../contexts/AuthContextCore";
import { useSpotifyAutoPreview } from "../hooks/useSpotifyAutoPreview";
import {
  DEFAULT_PROFILE_IMAGE,
  resolvedProfileImageUrl,
} from "../utils/profileImage";
import "./Home.css";

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
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter(
    (row) => row != null && row.comment_deleted == null,
  );
}

function commentUserFromRow(row) {
  const raw = row?.Users ?? row?.users;
  const u = Array.isArray(raw) ? raw[0] : raw;
  return u != null && typeof u === "object" ? u : {};
}

function postAuthorUserFromPost(post) {
  const raw = post?.Users ?? post?.users;
  const u = Array.isArray(raw) ? raw[0] : raw;
  return u != null && typeof u === "object" ? u : {};
}

/** 중첩 Users + 행 폴백 — 피드 카드·댓글 동일 규칙 */
function profileRawFromUserAndRow(u, row) {
  const candidates = [
    u?.user_profile_url,
    u?.profile_image_url,
    row?.user_profile_url,
    row?.profile_image_url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() !== "") return c.trim();
  }
  return "";
}

function postAuthorProfileRawFromPost(post) {
  return profileRawFromUserAndRow(postAuthorUserFromPost(post), post);
}

/** 댓글 작성자 프로필 URL(원문). 비어 있으면 `resolvedProfileImageUrl`이 기본 이미지로 처리 */
function commentProfileRawFromRow(row) {
  return profileRawFromUserAndRow(commentUserFromRow(row), row);
}

/** 행에 직접 없으면 중첩 Users.user_id (피드 형태 차이 대비) */
function commentAuthorUserId(row) {
  if (row == null) return null;
  if (row.user_id != null) return row.user_id;
  const u = commentUserFromRow(row);
  return u?.user_id ?? null;
}

function isOwnSheetComment(row, appUserId) {
  const cid = commentAuthorUserId(row);
  if (cid == null || appUserId == null) return false;
  return String(cid) === String(appUserId);
}

function sheetCommentsSorted(rows) {
  return [...rows].sort((a, b) => {
    const ta = new Date(a.comment_created ?? 0).getTime();
    const tb = new Date(b.comment_created ?? 0).getTime();
    return ta - tb;
  });
}

/** parent_comment_id 기준 트리 순회(선주 후손), 고아 댓글은 루트로 표시 */
function orderedCommentsWithDepth(rows) {
  const valid = rows.filter((r) => r != null && r.comment_id != null);
  const byId = new Map(valid.map((r) => [String(r.comment_id), r]));
  const children = new Map();
  for (const r of valid) {
    const pid = r.parent_comment_id;
    if (pid == null) continue;
    const key = String(pid);
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(r);
  }
  for (const list of children.values()) {
    list.sort(
      (a, b) =>
        new Date(a.comment_created ?? 0).getTime() -
        new Date(b.comment_created ?? 0).getTime(),
    );
  }
  const roots = valid
    .filter((r) => {
      if (r.parent_comment_id == null) return true;
      return !byId.has(String(r.parent_comment_id));
    })
    .sort(
      (a, b) =>
        new Date(a.comment_created ?? 0).getTime() -
        new Date(b.comment_created ?? 0).getTime(),
    );

  const out = [];
  function walk(node, depth) {
    out.push({ row: node, depth });
    const kids = children.get(String(node.comment_id)) ?? [];
    for (const k of kids) walk(k, depth + 1);
  }
  for (const root of roots) walk(root, 0);
  return out;
}

/** 서버 피드 댓글 + 아직 반영 전 방금 작성분(pending) 합치기 */
function mergeSheetCommentsFromFeed(post, pendingRows, removedCommentIds) {
  const omit = new Set((removedCommentIds ?? []).map((id) => String(id)));
  const server = commentsFromPost(post).filter(
    (r) => r.comment_id != null && !omit.has(String(r.comment_id)),
  );
  const serverIds = new Set(
    server.map((r) => r.comment_id).filter((id) => id != null),
  );
  const pending = pendingRows.filter(
    (r) =>
      r.comment_id != null &&
      !omit.has(String(r.comment_id)) &&
      !serverIds.has(r.comment_id),
  );
  return sheetCommentsSorted([...server, ...pending]);
}

function formatSheetCommentTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

/** CSS `.home-comment-sheet` peek / expanded — 일반 vs 카드 뒤집힌 뒤(Figma /home ver.1) */
function getCommentSheetPeekHeightPx(fromFlipView = false) {
  if (typeof window === "undefined") return fromFlipView ? 360 : 520;
  if (fromFlipView) {
    return Math.min(400, Math.round(window.innerHeight * 0.405));
  }
  return Math.min(520, Math.round(window.innerHeight * 0.58));
}

function getCommentSheetExpandedHeightPx() {
  if (typeof window === "undefined") return 640;
  const vh = window.innerHeight;
  return Math.min(Math.round(vh * 0.92), vh - 12);
}

/** peek 에서 아래로 줄일 수 있는 최소 높이 */
function getCommentSheetPeekMinShrinkPx(peekH) {
  return Math.max(152, Math.round(peekH * 0.34));
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

/** Tracks 단일 행 | 배열 */
function trackFromPost(post) {
  const raw = post?.Tracks ?? post?.tracks;
  if (raw == null) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

/** PostMedia: 배열 | 단일 행 — URL 목록(순서 유지, 중복 제거) */
function postMediaUrlsFromPost(post) {
  const raw = post?.PostMedia ?? post?.post_media;
  const rows = Array.isArray(raw)
    ? raw
    : raw != null && typeof raw === "object"
      ? [raw]
      : [];
  const sorted = [...rows].sort((a, b) => {
    const oa = Number(a?.display_order);
    const ob = Number(b?.display_order);
    if (Number.isFinite(oa) && Number.isFinite(ob) && oa !== ob) {
      return oa - ob;
    }
    return 0;
  });
  const seen = new Set();
  const out = [];
  for (const row of sorted) {
    const u = typeof row?.media_url === "string" ? row.media_url.trim() : "";
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

/** 포스트 첨부 사진 — 여러 장이면 가로 스냅 스크롤 (피그마 /home 카드 영역) */
function HomeCardMediaStrip({ urls, imageAlt }) {
  const scrollRef = useRef(null);
  const [activeDot, setActiveDot] = useState(0);

  const syncDot = useCallback(() => {
    const el = scrollRef.current;
    if (!el || urls.length < 2) return;
    const w = el.clientWidth;
    if (!(w > 0)) return;
    const i = Math.min(
      urls.length - 1,
      Math.max(0, Math.round(el.scrollLeft / w)),
    );
    setActiveDot(i);
  }, [urls.length]);

  const onScroll = useCallback(() => {
    syncDot();
  }, [syncDot]);

  useEffect(() => {
    syncDot();
  }, [urls, syncDot]);

  if (!urls.length) return null;

  return (
    <div className="home-card-media-wrap">
      <div
        className="home-card-media-strip"
        ref={scrollRef}
        onScroll={onScroll}
        role="list"
        aria-label="포스트에 첨부된 이미지"
      >
        {urls.map((url, i) => (
          <div
            className="home-card-media-slide"
            key={`${url}-${i}`}
            role="listitem"
          >
            <img
              className="home-card-image"
              src={url}
              alt={i === 0 ? imageAlt || "포스트 사진" : ""}
            />
          </div>
        ))}
      </div>
      {urls.length > 1 ? (
        <div className="home-card-media-dots" aria-hidden>
          {urls.map((_, i) => (
            <span
              key={i}
              className={`home-card-media-dot${i === activeDot ? " home-card-media-dot--active" : ""}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function spotifyTrackUrl(track) {
  const id = typeof track?.track_id === "string" ? track.track_id.trim() : "";
  return id ? `https://open.spotify.com/track/${encodeURIComponent(id)}` : "";
}

/** feed 가 null 이면 로딩 중, 배열이면 로딩 완료(빈 배열 가능) */
function Home({
  feed = null,
  focusPostId = null,
  feedEmptyDetail = null,
  onPullRefresh,
  onCommentSheetOpenChange,
  onCommentCreated,
}) {
  const isLoading = feed === null;
  const list = isLoading ? [null] : feed;
  const [activeIndex, setActiveIndex] = useState(0);
  /** 활성 카드: 전체 3D 플립으로 업로드 사진면 표시 */
  const [cardFlipped, setCardFlipped] = useState(false);
  /** 플립 시 한 장만 보기 + 상단 제목·가수, 나가면 스크롤 복원 */
  const [feedFocused, setFeedFocused] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedPullHint, setFeedPullHint] = useState(false);
  const [likeStateByPostId, setLikeStateByPostId] = useState({});
  const [commentSheetPost, setCommentSheetPost] = useState(null);
  /** 카드 뒷면(한 장 보기+플립)에서 댓글 연 시 — Figma ver.1 시트 높이·톤 */
  const [commentSheetFromFlipView, setCommentSheetFromFlipView] =
    useState(false);
  /** 위치·반경 확인 전에는 스켈레톤만 보이고 입력 비활성 */
  const [commentSheetAccessPending, setCommentSheetAccessPending] =
    useState(false);
  const commentSheetPostRef = useRef(null);
  const [commentDraft, setCommentDraft] = useState("");
  const cardRefs = useRef([]);
  const feedScrollRef = useRef(null);
  const feedScrollBeforeFocusRef = useRef(0);
  /** 직전 feed — null → 배열 첫 로드일 때만 맨 위 스크롤 보정 */
  const prevFeedRef = useRef(null);
  /** 한 장 보기 종료 직후 layout 단계에서 scrollTop 복원 (페인트 전, 번쩍임 방지) */
  const shouldRestoreFeedScrollRef = useRef(false);
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
  const [playbackNotice, setPlaybackNotice] = useState("");
  /** 앨범 커버 색감 기준: 밝으면 상단 트랙 타이틀·가수를 검정, 어두우면 흰색 */
  const [trackMetaOnLightBg, setTrackMetaOnLightBg] = useState(false);
  const { spotifyToken, user } = useAuth();
  /** Auth 메타데이터에 없을 때 Users 테이블 프로필 (고정 id·OAuth 병행) */
  const [dbUserProfileUrl, setDbUserProfileUrl] = useState(null);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    setCardFlipped(false);
    setFeedFocused((wasFocused) => {
      if (wasFocused) shouldRestoreFeedScrollRef.current = true;
      return false;
    });
  }, [activeIndex]);

  useEffect(() => {
    if (feed === null) {
      setCardFlipped(false);
      setFeedFocused((wasFocused) => {
        if (wasFocused) shouldRestoreFeedScrollRef.current = true;
        return false;
      });
    }
  }, [feed]);

  useEffect(() => {
    if (!feedFocused) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        shouldRestoreFeedScrollRef.current = true;
        setFeedFocused(false);
        setCardFlipped(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feedFocused]);

  useLayoutEffect(() => {
    const root = feedScrollRef.current;
    if (!root) return;
    if (feedFocused) {
      root.scrollTop = 0;
      return;
    }
    if (shouldRestoreFeedScrollRef.current) {
      shouldRestoreFeedScrollRef.current = false;
      root.scrollTop = feedScrollBeforeFocusRef.current;
    }
  }, [feedFocused, activeIndex]);

  const likeUserId = user?.id;

  useEffect(() => {
    const id = Number(likeUserId);
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    void getUserById(id).then((row) => {
      if (cancelled) return;
      setDbUserProfileUrl(
        row && typeof row.user_profile_url === "string"
          ? row.user_profile_url.trim() || null
          : null,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [likeUserId]);

  /** 로그인 사용자 — Auth에서 머지된 프로필 URL 우선(카드·댓글·입력창 동일) */
  const meProfileRaw =
    (typeof user?.user_metadata?.user_profile_url === "string" &&
      user.user_metadata.user_profile_url.trim()) ||
    (typeof dbUserProfileUrl === "string" && dbUserProfileUrl.trim()) ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    "";
  const composerAvatarSrc = resolvedProfileImageUrl(meProfileRaw);

  const sheetPostFresh = useMemo(() => {
    if (!commentSheetPost?.post_id) return null;
    const pid = String(commentSheetPost.post_id);
    const hit = list.find((p) => p != null && String(p.post_id) === pid);
    return hit ?? commentSheetPost;
  }, [list, commentSheetPost]);

  const sheetCommentsList = useMemo(
    () =>
      mergeSheetCommentsFromFeed(
        sheetPostFresh,
        pendingSheetComments,
        removedSheetCommentIds,
      ),
    [sheetPostFresh, pendingSheetComments, removedSheetCommentIds],
  );

  const sheetCommentsThread = useMemo(
    () => orderedCommentsWithDepth(sheetCommentsList),
    [sheetCommentsList],
  );

  useEffect(() => {
    commentSheetPostRef.current = commentSheetPost;
  }, [commentSheetPost]);

  useEffect(() => {
    onCommentSheetOpenChange?.(Boolean(commentSheetPost));
  }, [commentSheetPost, onCommentSheetOpenChange]);

  useEffect(() => {
    if (!commentSheetPost || commentSheetAccessPending) return;
    const t = window.setTimeout(() => commentInputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [commentSheetPost, commentSheetAccessPending]);

  useEffect(() => {
    if (!commentSheetPost || commentSheetAccessPending) return;
    const el = commentScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [commentSheetPost, commentSheetAccessPending, sheetCommentsList.length]);

  useEffect(() => {
    sheetTranslateYRef.current = sheetTranslateY;
  }, [sheetTranslateY]);

  useEffect(() => {
    sheetExpandedRef.current = sheetExpanded;
  }, [sheetExpanded]);

  useEffect(() => {
    if (!commentSheetPost) {
      flushCommentLongPressTimer();
      setSheetTranslateY(0);
      setSheetDragging(false);
      setSheetExpanded(false);
      setSheetInteractiveHeightPx(null);
      setCommentSheetAccessPending(false);
      setCommentReplyTarget(null);
      setRemovedSheetCommentIds([]);
      setCommentDeletePrompt(null);
      commentSheetDragRef.current.active = false;
      setCommentSheetFromFlipView(false);
    }
  }, [commentSheetPost]);

  const closeCommentSheet = () => {
    flushCommentLongPressTimer();
    setCommentSheetPost(null);
    setCommentDraft("");
    setCommentReplyTarget(null);
    setRemovedSheetCommentIds([]);
    setCommentDeletePrompt(null);
    setCommentSheetAccessPending(false);
    setCommentAccessBusy(false);
    setPendingSheetComments([]);
    setSheetExpanded(false);
    setSheetTranslateY(0);
    setSheetDragging(false);
    setSheetInteractiveHeightPx(null);
    setCommentSheetFromFlipView(false);
  };

  const onCommentSheetHandlePointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const d = commentSheetDragRef.current;
    d.active = true;
    d.pointerId = e.pointerId;
    d.startY = e.clientY;
    d.lastClientY = e.clientY;
    d.minClientY = e.clientY;
    d.bestDy = 0;
    d.lastStretchDown = 0;
    d.expandDragStartHeight = sheetExpandedRef.current
      ? commentSheetRef.current?.offsetHeight ??
        getCommentSheetExpandedHeightPx()
      : null;
    d.startTranslate = sheetTranslateYRef.current;
    d.lastOffset = sheetTranslateYRef.current;
    setSheetInteractiveHeightPx(null);
    setSheetDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCommentSheetHandlePointerMove = (e) => {
    const d = commentSheetDragRef.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    d.lastClientY = e.clientY;

    if (sheetExpandedRef.current) {
      /* 확장: 아래로 당기면 먼저 높이만 줄이고, peek 이후에는 translate */
      if (dy <= 0) {
        setSheetInteractiveHeightPx(null);
        setSheetTranslateY(0);
        d.lastOffset = 0;
        d.lastStretchDown = 0;
        return;
      }
      const stretchDown = dy;
      d.lastStretchDown = stretchDown;
      const exp =
        d.expandDragStartHeight ?? getCommentSheetExpandedHeightPx();
      const peek = getCommentSheetPeekHeightPx(commentSheetFromFlipView);
      const shrunk = Math.max(peek, Math.round(exp - stretchDown));
      const overflowDown = Math.max(0, stretchDown - (exp - peek));
      setSheetInteractiveHeightPx(shrunk);
      setSheetTranslateY(overflowDown);
      d.lastOffset = overflowDown;
      return;
    }

    d.bestDy = Math.min(d.bestDy, dy);
    d.minClientY = Math.min(d.minClientY ?? e.clientY, e.clientY);

    /* peek: 아래로 당기면 높이 줄이다가 더 당기면 translate · 위로는 높이만 늘림 */
    if (e.clientY >= d.startY) {
      const stretchDown = e.clientY - d.startY;
      d.lastStretchDown = stretchDown;
      const peek = getCommentSheetPeekHeightPx(commentSheetFromFlipView);
      const minH = getCommentSheetPeekMinShrinkPx(peek);
      const shrunk = Math.max(minH, peek - stretchDown);
      const overflowDown = Math.max(0, stretchDown - (peek - minH));
      setSheetInteractiveHeightPx(Math.round(shrunk));
      setSheetTranslateY(overflowDown);
      d.lastOffset = overflowDown;
      return;
    }

    d.lastStretchDown = 0;
    setSheetTranslateY(0);
    d.lastOffset = 0;
    const stretchPx = Math.max(0, d.startY - d.minClientY);
    const peek = getCommentSheetPeekHeightPx(commentSheetFromFlipView);
    const exp = getCommentSheetExpandedHeightPx();
    const h = Math.min(peek + stretchPx, exp);
    setSheetInteractiveHeightPx(Math.round(h));
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

    const expanded = sheetExpandedRef.current;
    const offset = d.lastOffset ?? sheetTranslateYRef.current;
    const totalDy = d.lastClientY - d.startY;
    const upwardIntent = Math.min(totalDy, d.bestDy);

    setSheetDragging(false);

    if (!expanded) {
      const minCy = d.minClientY ?? d.startY;
      const releaseStretch = Math.max(0, d.startY - minCy);
      const peek = getCommentSheetPeekHeightPx(commentSheetFromFlipView);
      const exp = getCommentSheetExpandedHeightPx();
      const expandThresholdPx = Math.max(
        56,
        Math.round((exp - peek) * 0.22),
      );

      const sheetH = commentSheetRef.current?.offsetHeight ?? 320;
      const dismissPeek = Math.min(112, sheetH * 0.28);

      const draggedHeightSnap = sheetInteractiveHeightPx;
      setSheetInteractiveHeightPx(null);

      if (offset >= dismissPeek) {
        closeCommentSheet();
        return;
      }
      if (
        upwardIntent < -36 ||
        releaseStretch >= expandThresholdPx ||
        (draggedHeightSnap != null &&
          draggedHeightSnap >= peek + (exp - peek) * 0.85)
      ) {
        setSheetExpanded(true);
        requestAnimationFrame(() => setSheetTranslateY(0));
        return;
      }
      requestAnimationFrame(() => setSheetTranslateY(0));
      return;
    }

    /* 확장: 높이 줄였을 때도 peek/닫기 판정 · 많이 내려야 완전 닫힘 */
    const peek = getCommentSheetPeekHeightPx(commentSheetFromFlipView);
    const exp =
      d.expandDragStartHeight ?? getCommentSheetExpandedHeightPx();
    const draggedHeightSnap = sheetInteractiveHeightPx;
    const shrinkProgress =
      exp > peek && draggedHeightSnap != null
        ? (exp - draggedHeightSnap) / (exp - peek)
        : 0;

    const collapseExpandedPx = 40;
    const dismissExpandedPx =
      typeof window !== "undefined"
        ? Math.min(340, Math.round(window.innerHeight * 0.42))
        : 300;

    setSheetInteractiveHeightPx(null);

    if (offset >= dismissExpandedPx) {
      closeCommentSheet();
      return;
    }
    if (
      offset >= collapseExpandedPx ||
      shrinkProgress >= 0.42 ||
      (draggedHeightSnap != null && draggedHeightSnap <= peek + 40)
    ) {
      setSheetExpanded(false);
      requestAnimationFrame(() => setSheetTranslateY(0));
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
    setSheetInteractiveHeightPx(null);
    requestAnimationFrame(() => setSheetTranslateY(0));
  };

  const showCommentSheetForPost = (post) => {
    flushCommentLongPressTimer();
    setCommentDraft("");
    setCommentReplyTarget(null);
    setRemovedSheetCommentIds([]);
    setCommentDeletePrompt(null);
    setPendingSheetComments([]);
    setSheetExpanded(false);
    setSheetInteractiveHeightPx(null);
    /* tryOpenCommentSheet 에서 같은 틱에 setFeedFocused/setCardFlipped 하면
       여기서 feedFocused/cardFlipped 는 아직 갱신 전이라 항상 플립 댓글 UI로 연다 */
    setCommentSheetFromFlipView(true);
    setCommentSheetPost(post);
    commentSheetPostRef.current = post;
  };

  const startReplyToComment = (row) => {
    if (commentSheetAccessPending || row?.comment_id == null) return;
    const u = commentUserFromRow(row);
    const name = u.user_name || "사용자";
    setCommentReplyTarget({ id: row.comment_id, name });
    window.requestAnimationFrame(() => commentInputRef.current?.focus());
  };

  const clearCommentReplyTarget = () => setCommentReplyTarget(null);

  const dismissCommentDeletePrompt = () => setCommentDeletePrompt(null);

  /** 스크롤 안에서 pointer 가 빨리 cancel 되는 터치 환경 대비 */
  const COMMENT_LONG_PRESS_MS = 580;
  /** 손가락 미세 흔들림 허용 (~35px) */
  const COMMENT_LONG_PRESS_MOVE_SQ = 1200;

  const beginCommentLongPress = (row, clientX, clientY, pressKey) => {
    flushCommentLongPressTimer();
    const lp = commentLongPressRef.current;
    lp.pointerId = pressKey;
    lp.startX = clientX;
    lp.startY = clientY;
    lp.timer = window.setTimeout(() => {
      lp.timer = null;
      lp.pointerId = null;
      setCommentDeletePrompt({ commentId: row.comment_id });
    }, COMMENT_LONG_PRESS_MS);
  };

  const handleCommentRowPointerDown = (row) => (e) => {
    if (!isOwnSheetComment(row, likeUserId)) return;
    if (commentSheetAccessPending) return;
    /* 터치는 touchstart 쪽에서만 처리 (pointercancel 로 타이머가 너무 자주 끊김) */
    if (e.pointerType === "touch") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    beginCommentLongPress(row, e.clientX, e.clientY, `p:${e.pointerId}`);
  };

  const handleCommentRowPointerMove = (e) => {
    const lp = commentLongPressRef.current;
    if (lp.timer == null || lp.pointerId == null) return;
    if (!String(lp.pointerId).startsWith("p:")) return;
    const pid = Number(String(lp.pointerId).slice(2));
    if (!Number.isFinite(pid) || pid !== e.pointerId) return;
    const dx = e.clientX - lp.startX;
    const dy = e.clientY - lp.startY;
    if (dx * dx + dy * dy > COMMENT_LONG_PRESS_MOVE_SQ)
      flushCommentLongPressTimer();
  };

  const handleCommentRowPointerEnd = (e) => {
    const lp = commentLongPressRef.current;
    if (lp.pointerId == null || !String(lp.pointerId).startsWith("p:"))
      return;
    const pid = Number(String(lp.pointerId).slice(2));
    if (!Number.isFinite(pid) || pid !== e.pointerId) return;
    flushCommentLongPressTimer();
  };

  const handleCommentRowTouchStart = (row) => (e) => {
    if (!isOwnSheetComment(row, likeUserId)) return;
    if (commentSheetAccessPending) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    beginCommentLongPress(row, t.clientX, t.clientY, `t:${t.identifier}`);
  };

  const handleCommentRowTouchMove = (e) => {
    const lp = commentLongPressRef.current;
    if (lp.timer == null || lp.pointerId == null) return;
    if (!String(lp.pointerId).startsWith("t:")) return;
    const tid = Number(String(lp.pointerId).slice(2));
    if (!Number.isFinite(tid)) return;
    const t = Array.from(e.touches).find((x) => x.identifier === tid);
    if (!t) return;
    const dx = t.clientX - lp.startX;
    const dy = t.clientY - lp.startY;
    if (dx * dx + dy * dy > COMMENT_LONG_PRESS_MOVE_SQ)
      flushCommentLongPressTimer();
  };

  const handleCommentRowTouchEndOrCancel = (e) => {
    const lp = commentLongPressRef.current;
    if (lp.pointerId == null || !String(lp.pointerId).startsWith("t:"))
      return;
    const tid = Number(String(lp.pointerId).slice(2));
    if (!Number.isFinite(tid)) return;
    const ended = Array.from(e.changedTouches).some(
      (x) => x.identifier === tid,
    );
    if (ended) flushCommentLongPressTimer();
  };

  const handleOwnCommentContextMenu = (row) => (e) => {
    if (!isOwnSheetComment(row, likeUserId)) return;
    if (commentSheetAccessPending) return;
    e.preventDefault();
    flushCommentLongPressTimer();
    setCommentDeletePrompt({ commentId: row.comment_id });
  };

  const confirmCommentDelete = async () => {
    const id = commentDeletePrompt?.commentId;
    if (id == null || commentDeleteSubmitting) return;
    const userId = Number(likeUserId);
    if (!Number.isFinite(userId)) {
      alert("사용자 정보를 확인할 수 없습니다.");
      return;
    }
    flushCommentLongPressTimer();
    setCommentDeleteSubmitting(true);
    try {
      const result = await deleteComment({ commentId: id, userId });
      if (result.error) {
        alert(result.error);
        return;
      }
      setRemovedSheetCommentIds((prev) =>
        prev.some((x) => String(x) === String(id)) ? prev : [...prev, id],
      );
      setPendingSheetComments((prev) =>
        prev.filter((r) => String(r.comment_id) !== String(id)),
      );
      setCommentReplyTarget((cur) =>
        cur != null && String(cur.id) === String(id) ? null : cur,
      );
      setCommentDeletePrompt(null);
      await onCommentCreated?.();
    } finally {
      setCommentDeleteSubmitting(false);
    }
  };

  const tryOpenCommentSheet = (post) => {
    if (!post?.post_id || commentAccessBusy) return;

    if (!feedFocused) {
      feedScrollBeforeFocusRef.current =
        feedScrollRef.current?.scrollTop ?? 0;
      setFeedFocused(true);
    }
    if (!cardFlipped) {
      setCardFlipped(true);
    }

    const insecure =
      typeof window !== "undefined" && !window.isSecureContext;
    const devCoords = getDevCommentCoordinates();

    const runCommentAccessCheck = async (lat, lng) => {
      const postId = post.post_id;
      try {
        const result = await checkCommentAccess(postId, lat, lng);
        if (commentSheetPostRef.current?.post_id !== postId) return;

        if (result?.invokeError) {
          closeCommentSheet();
          alert(
            "댓글을 조회할 수 없습니다. 네트워크 상태를 확인해 주세요.",
          );
          return;
        }

        if (result?.is_accessible) {
          setCommentSheetAccessPending(false);
        } else {
          const detail =
            typeof result?.message === "string" && result.message.trim()
              ? `\n\n${result.message.trim()}`
              : "";
          closeCommentSheet();
          alert(`조회할 수 없습니다.${detail}`);
        }
      } catch {
        if (commentSheetPostRef.current?.post_id !== postId) return;
        closeCommentSheet();
        alert("댓글을 조회할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setCommentAccessBusy(false);
      }
    };

    /* 비 HTTPS(예: http://192.168…)에서는 브라우저가 Geolocation 자체를 막음 */
    if (insecure && devCoords) {
      setCommentAccessBusy(true);
      showCommentSheetForPost(post);
      setCommentSheetAccessPending(true);
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
    showCommentSheetForPost(post);
    setCommentSheetAccessPending(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await runCommentAccessCheck(
          pos.coords.latitude,
          pos.coords.longitude,
        );
      },
      (geoErr) => {
        setCommentAccessBusy(false);
        closeCommentSheet();
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
        timeout: 15000,
        /* 같은 세션에서 댓글 다시 열 때 매번 새 GNSS 고정을 기다리지 않도록 캐시 허용 */
        maximumAge: 120000,
      },
    );
  };

  const submitCommentDraft = async () => {
    const text = commentDraft.trim();
    const postId = commentSheetPost?.post_id;
    if (
      !text ||
      postId == null ||
      commentSubmitting ||
      commentSheetAccessPending
    )
      return;

    const userId = Number(likeUserId);
    if (!Number.isFinite(userId)) {
      alert("사용자 정보를 확인할 수 없습니다.");
      return;
    }

    setCommentSubmitting(true);
    try {
      const parentCommentId = commentReplyTarget?.id;
      const result = await createComment({
        postId,
        userId,
        content: text,
        ...(parentCommentId != null ? { parentCommentId } : {}),
      });

      if (result.error) {
        alert(result.error);
        return;
      }

      const created = result.data;
      if (created && created.comment_id != null) {
        const displayName =
          user?.user_metadata?.user_name ||
          user?.user_metadata?.full_name ||
          (typeof user?.email === "string"
            ? user.email.split("@")[0]
            : null) ||
          "나";
        setPendingSheetComments((prev) => [
          ...prev,
          {
            ...created,
            parent_comment_id:
              created.parent_comment_id ?? parentCommentId ?? null,
            comment_deleted: created.comment_deleted ?? null,
            Users: {
              user_name: displayName,
              user_profile_url: meProfileRaw || null,
            },
          },
        ]);
      }

      setCommentDraft("");
      setCommentReplyTarget(null);
      await onCommentCreated?.();
      commentInputRef.current?.focus();
    } finally {
      setCommentSubmitting(false);
    }
  };

  useEffect(() => {
    if (activeIndex > list.length - 1) {
      setActiveIndex(0);
    }
  }, [activeIndex, list.length]);

  const blurPost = !isLoading ? list[activeIndex] ?? null : null;
  const blurTrack = trackFromPost(blurPost);
  const blurBackground =
    typeof blurTrack?.album_image_url === "string"
      ? blurTrack.album_image_url.trim()
      : "";

  useEffect(() => {
    if (!feedFocused || !blurBackground) {
      setTrackMetaOnLightBg(false);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const w = 28;
        const h = 28;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        let sum = 0;
        const pixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          sum +=
            0.2126 * data[i] +
            0.7152 * data[i + 1] +
            0.0722 * data[i + 2];
        }
        const avg = sum / pixels / 255;
        if (!cancelled) setTrackMetaOnLightBg(avg > 0.48);
      } catch {
        if (!cancelled) setTrackMetaOnLightBg(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) setTrackMetaOnLightBg(false);
    };
    img.src = blurBackground;
    return () => {
      cancelled = true;
    };
  }, [feedFocused, blurBackground]);

  const activePost = !isLoading ? list[activeIndex] ?? null : null;

  const showPlaybackUnavailable = useCallback(({ track }) => {
    const title =
      typeof track?.track_title === "string" && track.track_title.trim()
        ? track.track_title.trim()
        : "이 노래";
    setPlaybackNotice(`${title}은(는) Spotify에서 재생할 수 없어요.`);
  }, []);

  const openTrackInSpotify = useCallback((track) => {
    const url = spotifyTrackUrl(track);
    if (!url) {
      setPlaybackNotice("Spotify에서 열 수 있는 트랙 정보가 없어요.");
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  useSpotifyAutoPreview(activePost, spotifyToken, {
    onUnavailable: showPlaybackUnavailable,
  });

  useEffect(() => {
    if (!playbackNotice) return undefined;
    const timer = window.setTimeout(() => setPlaybackNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [playbackNotice]);

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

  /** 바로 위·아래 카드 탭 시 한 칸 스냅 스크롤 (캡처에서 처리해 비활성 카드 플립 버튼과 충돌 방지) */
  const handleAdjacentFeedItemClickCapture = useCallback(
    (e) => {
      if (feed === null || feedFocused) return;
      const el = e.currentTarget;
      if (!(el instanceof HTMLElement)) return;
      const idx = Number(el.dataset.feedIdx);
      if (!Number.isFinite(idx)) return;
      const ai = activeIndexRef.current;
      if (idx === ai) return;
      if (idx !== ai - 1 && idx !== ai + 1) return;
      const node = cardRefs.current[idx];
      if (!node) return;
      e.preventDefault();
      e.stopPropagation();
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [feed, feedFocused],
  );

  useEffect(() => {
    if (feed === null) {
      prevFeedRef.current = null;
      return;
    }

    const prev = prevFeedRef.current;
    prevFeedRef.current = feed;

    /* 로딩 끝난 직후 한 번: 첫 포스트가 화면 중심에 오도록 (스냅·레이아웃 전 active 추측 오류 방지) */
    if (prev !== null) return;

    if (focusPostId) {
      const idx = feed.findIndex(
        (post) => String(post?.post_id) === String(focusPostId),
      );
      if (idx >= 0) return;
    }

    setActiveIndex(0);
    requestAnimationFrame(() => {
      const root = feedScrollRef.current;
      if (root) root.scrollTop = 0;
      requestAnimationFrame(() => {
        const r = feedScrollRef.current;
        if (r) updateActiveFromScroll(r);
      });
    });
  }, [feed, focusPostId]);

  useEffect(() => {
    const root = feedScrollRef.current;
    if (!root) return;
    updateActiveFromScroll(root);
  }, [list.length]);

  useEffect(() => {
    if (!focusPostId || !Array.isArray(feed) || feed.length === 0) {
      return undefined;
    }

    const targetIndex = feed.findIndex(
      (post) => String(post?.post_id) === String(focusPostId),
    );
    if (targetIndex < 0) return undefined;

    setActiveIndex(targetIndex);
    const frame = window.requestAnimationFrame(() => {
      cardRefs.current[targetIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [feed, focusPostId]);

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
    if (feedFocused) {
      shouldRestoreFeedScrollRef.current = true;
      setFeedFocused(false);
      setCardFlipped(false);
      return;
    }
    const root = feedScrollRef.current;
    if (!root) return;
    root.scrollTo({ top: 0, behavior: "smooth" });
    setActiveIndex(0);
  };

  return (
    <section className="home-wrap">
      {playbackNotice ? (
        <div className="home-playback-notice" role="status">
          {playbackNotice}
        </div>
      ) : null}
      <div
        className={`home-phone${
          commentSheetPost && commentSheetFromFlipView
            ? ` home-phone--flip-comment${sheetExpanded ? " home-phone--flip-comment--expanded" : ""}`
            : ""
        }`}
        style={
          blurBackground
            ? {
                "--home-blur-url": `url(${JSON.stringify(blurBackground)})`,
              }
            : undefined
        }
      >
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
            aria-label={feedFocused ? "한 장 보기 나가기" : "피드 맨 위로 이동"}
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
          className={`home-feed-scroll${feedFocused ? " home-feed-scroll--focused" : ""}`}
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
            const track = !isSkeleton ? trackFromPost(post) : null;
            const albumArt =
              typeof track?.album_image_url === "string"
                ? track.album_image_url.trim()
                : "";
            const userData = postAuthorUserFromPost(post);
            const postAuthorId = userData?.user_id;
            const avatarRaw =
              postAuthorId != null &&
              likeUserId != null &&
              String(postAuthorId) === String(likeUserId)
                ? meProfileRaw
                : postAuthorProfileRawFromPost(post);
            const avatarSrc = resolvedProfileImageUrl(avatarRaw);
            const userName = userData?.user_name || "annonymous";
            const placeName = post?.Places?.place_name || "서울 홍대입구역";
            const content =
              post?.content ||
              "이 공간에는 르세라핌 'Spaghetti'처럼 텐션 있는 음악이 어울려요.";
            const mediaUrls = !isSkeleton ? postMediaUrlsFromPost(post) : [];
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
            const trackTitle =
              typeof track?.track_title === "string"
                ? track.track_title.trim()
                : "";
            const artistName =
              typeof track?.artist_name === "string"
                ? track.artist_name.trim()
                : "";

            const showTrackAbove =
              feedFocused &&
              isActive &&
              !isSkeleton &&
              (Boolean(trackTitle) || Boolean(artistName));

            return (
              <div
                className={`home-feed-item${
                  !feedFocused && !isSkeleton && idx < activeIndex
                    ? " home-feed-item--past"
                    : ""
                }${
                  !feedFocused && !isSkeleton && idx > activeIndex
                    ? " home-feed-item--next"
                    : ""
                }${
                  feedFocused && idx !== activeIndex
                    ? " home-feed-item--focus-hidden"
                    : ""
                }`}
                key={post?.post_id || idx}
                data-feed-idx={idx}
                ref={(el) => {
                  cardRefs.current[idx] = el;
                }}
                onClickCapture={
                  !isSkeleton && !feedFocused && idx !== activeIndex
                    ? handleAdjacentFeedItemClickCapture
                    : undefined
                }
              >
                {showTrackAbove ? (
                  <div className="home-feed-item-track-slot">
                    <div
                      className={`home-track-meta home-track-meta--above${
                        trackMetaOnLightBg
                          ? " home-track-meta--above--light-bg"
                          : " home-track-meta--above--dark-bg"
                      }`}
                    >
                      {trackTitle ? (
                        <p className="home-track-title">{trackTitle}</p>
                      ) : null}
                      {artistName ? (
                        <p className="home-track-artist">{artistName}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <article
                  className={`home-card${isActive ? " home-card--active" : ""}${isSkeleton ? " home-card--no-flip" : ""}${!isSkeleton && isActive && feedFocused && cardFlipped ? " home-card--flipped" : ""}`}
                >
                  {isSkeleton ? (
                    <>
                      <div className="home-card-image home-card-image-skeleton" />
                      {isActive ? (
                        <>
                          <div className="home-card-top-shadow" />
                          <div className="home-card-bottom-shadow" />
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
                      ) : null}
                    </>
                  ) : (
                    <div className="home-card-flip-inner">
                      <div className="home-card-face home-card-face--front">
                        <button
                          type="button"
                          className="home-card-flip-trigger"
                          tabIndex={isActive ? 0 : -1}
                          aria-expanded={Boolean(
                            isActive && cardFlipped && feedFocused,
                          )}
                          aria-label={
                            mediaUrls.length > 0
                              ? "업로드한 사진 보기"
                              : albumArt
                                ? "앨범 표지 보기"
                                : "한 장 보기"
                          }
                          onClick={() => {
                            if (!isActive) return;
                            if (!feedFocused) {
                              feedScrollBeforeFocusRef.current =
                                feedScrollRef.current?.scrollTop ?? 0;
                              setFeedFocused(true);
                              setCardFlipped(true);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (!isActive) return;
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            if (!feedFocused) {
                              feedScrollBeforeFocusRef.current =
                                feedScrollRef.current?.scrollTop ?? 0;
                              setFeedFocused(true);
                              setCardFlipped(true);
                            }
                          }}
                        >
                          <div className="home-card-flip-trigger-media">
                            {albumArt ? (
                              <img
                                className="home-card-image"
                                src={albumArt}
                                alt={placeName}
                              />
                            ) : (
                              <div className="home-card-image home-card-image-empty" />
                            )}
                          </div>
                          <div className="home-card-top-shadow" />
                          <div className="home-card-bottom-shadow" />
                        </button>
                        {isActive ? (
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
                                onClick={() => openTrackInSpotify(track)}
                                aria-label={
                                  trackTitle
                                    ? `${trackTitle} Spotify에서 열기`
                                    : "Spotify에서 열기"
                                }
                              >
                                <img
                                  className="home-action-icon home-action-icon--spotify"
                                  src="/spotify.btn.svg"
                                  alt=""
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                      <div
                        className="home-card-face home-card-face--back"
                        role="group"
                        aria-label="포스트 미디어"
                        onClick={(e) => {
                          if (!isActive || !cardFlipped || !feedFocused) return;
                          const t = e.target;
                          if (typeof t.closest !== "function") return;
                          if (
                            t.closest(".home-user") ||
                            t.closest(".home-content") ||
                            t.closest(".home-actions")
                          ) {
                            return;
                          }
                          shouldRestoreFeedScrollRef.current = true;
                          setFeedFocused(false);
                          setCardFlipped(false);
                        }}
                      >
                        <div className="home-card-back-bg" aria-hidden>
                          {mediaUrls.length > 0 ? (
                            <HomeCardMediaStrip
                              urls={mediaUrls}
                              imageAlt={placeName || "포스트 사진"}
                            />
                          ) : albumArt ? (
                            <img
                              className="home-card-image home-card-image--album-cover"
                              src={albumArt}
                              alt=""
                            />
                          ) : (
                            <div className="home-card-image home-card-image-empty" />
                          )}
                        </div>
                        {isActive ? (
                          <>
                            <div className="home-card-top-shadow" aria-hidden />
                            <div className="home-card-bottom-shadow" aria-hidden />
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
                                onClick={() => openTrackInSpotify(track)}
                                aria-label={
                                  trackTitle
                                    ? `${trackTitle} Spotify에서 열기`
                                    : "Spotify에서 열기"
                                }
                              >
                                <img
                                  className="home-action-icon home-action-icon--spotify"
                                  src="/spotify.btn.svg"
                                  alt=""
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  )}
                </article>
              </div>
            );
          })}
          {isLoading || list.length > 0 ? (
            <div
              className={`home-feed-scroll-tail${feedFocused ? " home-feed-scroll-tail--hidden" : ""}`}
              aria-hidden
            />
          ) : null}
        </div>
      </div>

      {commentSheetPost && (
        <div
          className={`home-comment-overlay${commentSheetFromFlipView ? " home-comment-overlay--flip-context" : ""}`}
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
                    const ownRow = isOwnSheetComment(row, likeUserId);
                    const profileRaw = ownRow
                      ? meProfileRaw
                      : commentProfileRawFromRow(row);
                    const avatarSrc = resolvedProfileImageUrl(profileRaw);
                    const key = row.comment_id;
                    const indentPx = depth > 0 ? Math.min(depth, 8) * 52 : 0;
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
                        <img
                          className="home-comment-item__avatar"
                          src={avatarSrc}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.src = DEFAULT_PROFILE_IMAGE;
                          }}
                        />
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
              ) : (
                <p className="home-comment-empty" role="status">
                  아직 댓글이 없네요
                </p>
              )}
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
                <img
                  className="home-comment-composer-avatar"
                  src={composerAvatarSrc}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.src = DEFAULT_PROFILE_IMAGE;
                  }}
                />
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
