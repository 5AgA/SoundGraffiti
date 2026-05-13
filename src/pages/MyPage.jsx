import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { getPostsByUserId, deletePost } from "../api/posts";
import { getUserById, getUserPostCount } from "../api/users";
import { checkCommentAccess } from "../api/comments";
import { toggleLike } from "../api/likes";
import {
  resolvedProfileImageUrl,
  DEFAULT_PROFILE_IMAGE,
} from "../utils/profileImage";
import { useTrackPreviewAudio } from "../hooks/useTrackPreviewAudio";
import { getDevGeoCoordinates } from "../utils/devGeoCoords";
import MyPageFlipCommentSheet from "../components/MyPageFlipCommentSheet";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContextCore";
import {
  ACCOUNT_PROVIDERS,
  PROVIDER_INFO,
  authOptionsForProvider,
  clearPendingIdentityLink,
  getProviderIcon,
  identityEmail,
  providerLabel,
  rememberPendingIdentityLink,
} from "../utils/authProviders";
import {
  clearMyPageSessionCache,
  readMyPageSessionCache,
  writeMyPageSessionCache,
} from "../utils/myPageSessionCache";
import "../components/Home.css";
import "./MyPage.css";

/** public/MY graffiti.svg와 동일 path — 인라인 SVG(img 미사용) */
const MY_GRAFFITI_WORDMARK_PATH =
  "M5.75416 29.736L3.99016 12.012V29.736H0.000156309V0.33596H5.96416L7.35016 15.834L8.69416 0.33596H14.7002V29.736H10.5002V12.516L8.82016 29.736H5.75416ZM23.7994 18.228V29.736H19.0114V18.438L15.3154 0.33596H19.7674L21.4474 10.878L23.1274 0.33596H27.4534L23.7994 18.228ZM37.5764 18.9V14.952H43.1204V29.736H39.3824V28.308C38.7104 29.442 37.6184 30.072 36.1064 30.072C33.3344 30.072 31.9484 28.098 31.9484 24.948V5.71196C31.9484 2.18396 33.7964 -3.82662e-05 37.4924 -3.82662e-05C41.1884 -3.82662e-05 43.0364 2.18396 43.0364 5.71196V10.458H38.2484V5.08196C38.2484 4.57796 38.1224 4.07396 37.4924 4.07396C36.8624 4.07396 36.7364 4.57796 36.7364 5.08196V24.99C36.7364 25.62 36.9464 26.124 37.6184 26.124C38.3744 26.124 38.5004 25.62 38.5004 24.99V18.9H37.5764ZM49.7501 18.396H49.3721V29.736H44.5841V0.33596H50.2541C53.8241 0.33596 55.6301 2.43596 55.6301 5.87996V12.432C55.6301 14.07 54.9161 15.33 53.5301 16.044C54.9161 16.884 55.6301 18.396 55.6301 20.37V25.662C55.6301 27.258 55.7981 28.518 56.0081 29.736H51.1361C50.8841 28.896 50.7581 27.216 50.7581 25.662V19.656C50.7581 18.984 50.5061 18.396 49.7501 18.396ZM49.7501 14.112C50.5481 14.112 50.7581 13.524 50.7581 12.852V5.58596C50.7581 4.91396 50.5061 4.32596 49.7501 4.32596H49.3721V14.112H49.7501ZM64.9459 29.736L64.2739 23.394H61.1659L60.5359 29.736H56.1679L59.9479 0.33596H65.7019L69.4819 29.736H64.9459ZM61.5439 19.572H63.8959L62.6779 8.06396L61.5439 19.572ZM78.4529 17.304H74.9249V29.736H70.1369V0.33596H79.1669V4.36796H74.9249V13.272H78.4529V17.304ZM88.8298 17.304H85.3018V29.736H80.5138V0.33596H89.5438V4.36796H85.3018V13.272H88.8298V17.304ZM95.6788 0.33596V29.736H90.8908V0.33596H95.6788ZM107.493 4.36796H104.553V29.736H99.7653V4.36796H96.8673V0.33596H107.493V4.36796ZM113.439 0.33596V29.736H108.651V0.33596H113.439Z";

/** @param {string | undefined} iso */
function formatRelativeKo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "방금 전";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return d.toLocaleDateString("ko-KR");
}

/** @param {Record<string, unknown>} post */
function trackFromPost(post) {
  const raw = post?.Tracks ?? post?.tracks;
  if (raw == null) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

/** @param {Record<string, unknown>} post */
function resolveAlbumCover(post) {
  const track = trackFromPost(post);
  const album = track?.album_image_url?.trim?.();
  if (album) return album;

  const pm = post?.PostMedia;
  const list = Array.isArray(pm) ? pm : pm ? [pm] : [];
  const first = list[0];
  return first?.media_url?.trim?.() ?? "";
}

/** PostMedia 행 → URL 목록 (홈과 동일 규칙) */
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

/** 홈 피드 앞면과 동일: 트랙 앨범 이미지 URL만 */
function trackAlbumArtFromPost(post) {
  const track = trackFromPost(post);
  return typeof track?.album_image_url === "string"
    ? track.album_image_url.trim()
    : "";
}

/** @param {{ urls: string[]; imageAlt: string }} props */
function MyPageFlipMediaStrip({ urls, imageAlt }) {
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

/** @param {Record<string, unknown>} post */
function resolvePlaceName(post) {
  const p = post?.Places;
  const row = Array.isArray(p) ? p[0] : p;
  return row?.place_name?.trim?.() || "장소 미설정";
}

/** @param {Record<string, unknown>} post */
function resolveTrackLine(post) {
  const raw = post?.Tracks ?? post?.tracks;
  const track = Array.isArray(raw) ? raw[0] : raw;
  const title =
    typeof track?.track_title === "string" ? track.track_title.trim() : "";
  const artist =
    typeof track?.artist_name === "string" ? track.artist_name.trim() : "";
  if (title && artist) return `${title} - ${artist}`;
  if (title) return title;
  if (artist) return artist;
  return "노래 정보 없음";
}

/** @param {Record<string, unknown>} post */
function likeCount(post) {
  const likes = post?.Likes;
  return Array.isArray(likes) ? likes.length : 0;
}

/** 삭제되지 않은 댓글 수 (Supabase 중첩 Comments: 배열 | 단일 행) */
function activeCommentCount(post) {
  const raw = post?.Comments ?? post?.comments;
  if (raw == null) return 0;
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter((row) => row != null && row.comment_deleted == null)
    .length;
}

function likesFromPost(post) {
  const raw = post?.Likes ?? post?.likes;
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function userMatchesLike(like, userId) {
  if (userId == null || like?.user_id == null) return false;
  return String(like.user_id) === String(userId);
}

function postAuthorUserFromPost(post) {
  const raw = post?.Users ?? post?.users;
  const u = Array.isArray(raw) ? raw[0] : raw;
  return u != null && typeof u === "object" ? u : {};
}

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

function postBodyText(post) {
  const c = post?.content;
  return typeof c === "string" ? c.trim() : "";
}

function spotifyTrackUrl(track) {
  const id = typeof track?.track_id === "string" ? track.track_id.trim() : "";
  return id ? `https://open.spotify.com/track/${encodeURIComponent(id)}` : "";
}

function getFlipCommentDevCoords() {
  const g = getDevGeoCoordinates();
  if (g) return g;
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

function MyPageFlipCardChrome({
  fp,
  displayName,
  viewerProfileRaw,
  likeUserId,
  likeStateByPostId,
  onLike,
  onComment,
  onSpotify,
  overlayShading = false,
}) {
  if (!fp) return null;
  const track = trackFromPost(fp);
  const author = postAuthorUserFromPost(fp);
  const userName = author?.user_name || displayName || "anonymous";
  const placeName = resolvePlaceName(fp);
  const body = postBodyText(fp);
  const meRaw =
    typeof viewerProfileRaw === "string" && viewerProfileRaw.trim() !== ""
      ? viewerProfileRaw.trim()
      : "";
  /** 마이페이지 그리드는 본인 글만 — 아바타는 항상 로그인 사용자(세션) 프로필 */
  const avatarRaw = meRaw || postAuthorProfileRawFromPost(fp);
  const avatarSrcFlip = resolvedProfileImageUrl(avatarRaw);
  const pid = fp?.post_id;
  const likes = likesFromPost(fp);
  const serverLiked = likes.some((like) => userMatchesLike(like, likeUserId));
  const serverLikeCount = likes.length;
  const localLike = pid != null ? likeStateByPostId[pid] : null;
  const isLiked = localLike?.liked ?? serverLiked;
  const likeCountDisplay = localLike?.count ?? serverLikeCount;
  const isLikePending = localLike?.pending ?? false;
  const commentCount = activeCommentCount(fp);
  const trackTitle =
    typeof track?.track_title === "string" ? track.track_title.trim() : "";

  return (
    <>
      {overlayShading ? (
        <>
          <div className="home-card-top-shadow" aria-hidden />
          <div className="home-card-bottom-shadow" aria-hidden />
        </>
      ) : null}
      <div className="home-user">
        <img
          className="home-avatar"
          src={avatarSrcFlip}
          alt={userName}
          onError={(e) => {
            e.currentTarget.src = DEFAULT_PROFILE_IMAGE;
          }}
        />
        <div>
          <p className="home-name">{userName}</p>
          <p className="home-place">{placeName}</p>
        </div>
      </div>
      <p className="home-content">
        {body || "이 공간에 남긴 이야기가 여기에 표시돼요."}
      </p>
      <div className="home-actions">
        <button
          type="button"
          className="home-action-btn"
          onClick={() => onLike(fp)}
          disabled={isLikePending}
        >
          <img
            className="home-action-icon"
            src={isLiked ? "/heart.fill.svg" : "/heart.empty.svg"}
            alt=""
            aria-hidden
          />
          <span>{likeCountDisplay}</span>
        </button>
        <button
          type="button"
          className="home-action-btn"
          onClick={() => onComment(fp)}
          aria-label="댓글 작성"
        >
          <img
            className="home-action-icon"
            src="/bubble.fill.svg"
            alt=""
            aria-hidden
          />
          <span>{commentCount}</span>
        </button>
        <button
          type="button"
          className="home-action-btn home-action-btn--spotify"
          onClick={() => track && onSpotify(track)}
          aria-label={
            trackTitle ? `${trackTitle} Spotify에서 열기` : "Spotify에서 열기"
          }
        >
          <img
            className="home-action-icon home-action-icon--spotify"
            src="/spotify.btn.svg"
            alt=""
            aria-hidden
          />
        </button>
      </div>
    </>
  );
}

/** @param {Record<string, unknown>[]} list @param {'latest'|'popular'} order */
function sortMyPosts(list, order) {
  const copy = [...list];
  if (order === "latest") {
    copy.sort(
      (a, b) =>
        new Date(String(b.post_created ?? 0)).getTime() -
        new Date(String(a.post_created ?? 0)).getTime(),
    );
    return copy;
  }
  copy.sort((a, b) => {
    const likeD = likeCount(b) - likeCount(a);
    if (likeD !== 0) return likeD;
    const commentD = activeCommentCount(b) - activeCommentCount(a);
    if (commentD !== 0) return commentD;
    return (
      new Date(String(b.post_created ?? 0)).getTime() -
      new Date(String(a.post_created ?? 0)).getTime()
    );
  });
  return copy;
}

const SKELETON_GRID_ITEMS = 8;
const MYPAGE_LONG_PRESS_MS = 520;
const MYPAGE_LONG_PRESS_MOVE_PX = 12;

function MyPageGridSkeleton() {
  return Array.from({ length: SKELETON_GRID_ITEMS }, (_, i) => (
    <article
      key={`mypage-sk-${i}`}
      className="mypage-card mypage-card--skeleton"
      aria-hidden
    >
      <div className="mypage-card__media">
        <div className="mypage-card__skel-image" />
        <div className="mypage-card__skel-shade" aria-hidden />
        <div className="mypage-card__skel-footer">
          <div className="mypage-card__skel-bar mypage-card__skel-bar--1" />
          <div className="mypage-card__skel-bar mypage-card__skel-bar--2" />
          <div className="mypage-card__skel-meta-row">
            <div className="mypage-card__skel-chip" />
            <div className="mypage-card__skel-chip mypage-card__skel-chip--short" />
          </div>
        </div>
      </div>
    </article>
  ));
}

function providerStatusText({ linked, current }) {
  if (current) return "현재 접속";
  if (!linked) return "미연결";
  return "연결됨";
}

export default function MyPage() {
  const {
    user,
    identities,
    linkedProviders,
    currentProvider,
    refreshAuthState,
  } = useAuth();
  const pageUserId = user?.appUserId ?? user?.id ?? null;
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [postCount, setPostCount] = useState(null);
  const [posts, setPosts] = useState([]);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [accountBusy, setAccountBusy] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [accountError, setAccountError] = useState("");
  const [sortOrder, setSortOrder] = useState(
    /** @type {'latest' | 'popular'} */ ("latest"),
  );
  const [postsRefreshing, setPostsRefreshing] = useState(false);
  const [deleteConfirmPostId, setDeleteConfirmPostId] = useState(
    /** @type {number | null} */ (null),
  );
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [flipPost, setFlipPost] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  );
  const [flipEntered, setFlipEntered] = useState(false);
  const [likeStateByPostId, setLikeStateByPostId] = useState(
    /** @type {Record<string, { liked: boolean; count: number; pending: boolean }>} */ ({}),
  );
  const [commentSheetPost, setCommentSheetPost] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  );
  const [commentAccessPending, setCommentAccessPending] = useState(false);
  const [commentAccessReady, setCommentAccessReady] = useState(false);
  const [playbackNotice, setPlaybackNotice] = useState("");
  const [flipTrackMetaOnLightBg, setFlipTrackMetaOnLightBg] = useState(false);
  const commentSheetPostRef = useRef(
    /** @type {Record<string, unknown> | null} */ (null),
  );

  const longPressDidOpenDeleteRef = useRef(false);

  const longPressRef = useRef({
    /** @type {ReturnType<typeof setTimeout> | null} */
    timer: null,
    x: 0,
    y: 0,
  });
  const blockLongPressRef = useRef(false);

  useEffect(() => {
    blockLongPressRef.current =
      deleteConfirmPostId != null || deleteBusy || postsRefreshing;
  }, [deleteConfirmPostId, deleteBusy, postsRefreshing]);

  const clearLongPressTimer = useCallback(() => {
    const t = longPressRef.current.timer;
    if (t != null) {
      clearTimeout(t);
      longPressRef.current.timer = null;
    }
  }, []);

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  useEffect(() => {
    if (deleteConfirmPostId == null) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !deleteBusy) {
        setDeleteConfirmPostId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteConfirmPostId, deleteBusy]);

  const sortedPosts = useMemo(
    () => sortMyPosts(posts, sortOrder),
    [posts, sortOrder],
  );

  const flipDisplayPost = useMemo(() => {
    if (!flipPost) return null;
    if (flipPost.post_id == null || flipPost.post_id === "") return flipPost;
    return (
      posts.find((p) => String(p.post_id) === String(flipPost.post_id)) ??
      flipPost
    );
  }, [flipPost, posts]);

  const closeFlipModal = useCallback(() => {
    setCommentSheetPost(null);
    setCommentAccessPending(false);
    setCommentAccessReady(false);
    setFlipPost(null);
    setFlipEntered(false);
  }, []);

  useEffect(() => {
    commentSheetPostRef.current = commentSheetPost;
  }, [commentSheetPost]);

  const flipBlurBackground = useMemo(() => {
    const p = flipDisplayPost ?? flipPost;
    if (!p) return "";
    const track = trackFromPost(p);
    const u = track?.album_image_url;
    return typeof u === "string" ? u.trim() : "";
  }, [flipDisplayPost, flipPost]);

  useEffect(() => {
    if (!flipPost || !flipBlurBackground) {
      setFlipTrackMetaOnLightBg(false);
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
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }
        const avg = sum / pixels / 255;
        if (!cancelled) setFlipTrackMetaOnLightBg(avg > 0.48);
      } catch {
        if (!cancelled) setFlipTrackMetaOnLightBg(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) setFlipTrackMetaOnLightBg(false);
    };
    img.src = flipBlurBackground;
    return () => {
      cancelled = true;
    };
  }, [flipPost, flipBlurBackground]);

  const flipModalTrack = useMemo(() => {
    const p = flipDisplayPost ?? flipPost;
    if (!p) return null;
    return trackFromPost(p);
  }, [flipDisplayPost, flipPost]);

  const flipTrackTitle =
    typeof flipModalTrack?.track_title === "string"
      ? flipModalTrack.track_title.trim()
      : "";
  const flipArtistName =
    typeof flipModalTrack?.artist_name === "string"
      ? flipModalTrack.artist_name.trim()
      : "";
  const showFlipTrackAbove =
    flipPost != null && (Boolean(flipTrackTitle) || Boolean(flipArtistName));

  const showPlaybackUnavailable = useCallback(({ track, reason }) => {
    const previewTitle =
      typeof track?.track_title === "string" && track.track_title.trim()
        ? track.track_title.trim()
        : "이 트랙";

    if (reason === "interaction_required") {
      setPlaybackNotice("화면을 한 번 터치하면 미리듣기가 재생돼요.");
      return;
    }
    if (reason === "no_preview") {
      setPlaybackNotice(`${previewTitle}은(는) 미리듣기를 제공하지 않아요.`);
      return;
    }
    if (reason === "preview_failed") {
      setPlaybackNotice(`${previewTitle} 미리듣기를 재생하지 못했어요.`);
      return;
    }
    const title =
      typeof track?.track_title === "string" && track.track_title.trim()
        ? track.track_title.trim()
        : "이 트랙";
    setPlaybackNotice(`${title} 미리듣기를 준비하지 못했어요.`);
  }, []);

  const previewAnchorPost =
    commentSheetPost ?? (flipPost ? (flipDisplayPost ?? flipPost) : null);
  useTrackPreviewAudio(previewAnchorPost, {
    onUnavailable: showPlaybackUnavailable,
  });

  useEffect(() => {
    if (!playbackNotice) return undefined;
    const t = window.setTimeout(() => setPlaybackNotice(""), 2800);
    return () => clearTimeout(t);
  }, [playbackNotice]);

  const handleFlipLikeToggle = useCallback(
    async (post) => {
      const postId = post?.post_id;
      const userId = user?.id;
      if (!postId || !userId) return;

      const likes = likesFromPost(post);
      const serverLiked = likes.some((like) => userMatchesLike(like, userId));
      const serverCount = likes.length;
      const currentState = likeStateByPostId[postId];
      const isLiked = currentState?.liked ?? serverLiked;
      const likeCount = currentState?.count ?? serverCount;
      const nextLiked = !isLiked;
      const nextCount = Math.max(0, likeCount + (nextLiked ? 1 : -1));

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

      setPosts((prevPosts) =>
        prevPosts.map((p) => {
          if (String(p?.post_id) !== String(postId)) return p;
          const prevLikes = likesFromPost(p);
          let nextLikes;
          if (nextLiked) {
            nextLikes = [
              ...prevLikes,
              { like_id: `local-${Date.now()}`, user_id: userId },
            ];
          } else {
            nextLikes = prevLikes.filter((lk) => !userMatchesLike(lk, userId));
          }
          return { ...p, Likes: nextLikes };
        }),
      );
    },
    [user?.id, likeStateByPostId],
  );

  const openSpotifyTrack = useCallback((track) => {
    const url = spotifyTrackUrl(track);
    if (!url) {
      setPlaybackNotice("Spotify에서 열 수 있는 트랙 정보가 없어요.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const tryOpenFlipCommentSheet = useCallback((post) => {
    if (!post?.post_id) return;

    const insecure = typeof window !== "undefined" && !window.isSecureContext;
    const devCoords = getFlipCommentDevCoords();

    const runCommentAccessCheck = async (lat, lng) => {
      const postId = post.post_id;
      try {
        const result = await checkCommentAccess(postId, lat, lng);
        if (commentSheetPostRef.current?.post_id !== postId) return;

        if (result?.invokeError) {
          setCommentSheetPost(null);
          setCommentAccessPending(false);
          alert("댓글을 조회할 수 없습니다. 네트워크 상태를 확인해 주세요.");
          return;
        }

        if (result?.is_accessible) {
          setCommentAccessReady(true);
        } else {
          const detail =
            typeof result?.message === "string" && result.message.trim()
              ? `\n\n${result.message.trim()}`
              : "";
          setCommentSheetPost(null);
          setCommentAccessPending(false);
          alert(`조회할 수 없습니다.${detail}`);
        }
      } catch {
        if (commentSheetPostRef.current?.post_id !== postId) return;
        setCommentSheetPost(null);
        setCommentAccessPending(false);
        alert("댓글을 조회할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setCommentAccessPending(false);
      }
    };

    setCommentAccessReady(false);
    setCommentAccessPending(true);
    setCommentSheetPost(post);
    commentSheetPostRef.current = post;

    if (insecure && devCoords) {
      void runCommentAccessCheck(devCoords.lat, devCoords.lng);
      return;
    }

    if (insecure && !devCoords) {
      setCommentSheetPost(null);
      setCommentAccessPending(false);
      alert(
        "지금 주소가 HTTP(비보안)라서 브라우저가 위치 API를 사용하지 못합니다.\n\n" +
          "[개발] .env.local 에 VITE_DEV_GEO_COORDS=위도,경도 또는 VITE_DEV_COMMENT_COORDS 를 넣고 npm run dev 를 다시 실행해 주세요.\n\n" +
          "[배포] HTTPS 로 접속하면 실제 GPS를 씁니다.",
      );
      return;
    }

    if (!navigator.geolocation) {
      setCommentSheetPost(null);
      setCommentAccessPending(false);
      alert(
        "이 기기에서는 위치 정보를 사용할 수 없어 댓글을 조회할 수 없습니다.",
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await runCommentAccessCheck(pos.coords.latitude, pos.coords.longitude);
      },
      (geoErr) => {
        setCommentAccessPending(false);
        setCommentSheetPost(null);
        const code = geoErr?.code;
        if (code === 1) {
          alert(
            "이 사이트에 대한 위치 접근이 허용되지 않았습니다.\n\n" +
              "브라우저 설정에서 위치를 허용했는지 확인해 주세요.",
          );
        } else {
          alert("위치를 확인할 수 없어 댓글을 조회할 수 없습니다.");
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 120000,
      },
    );
  }, []);

  const handleFlipCommentRowCreated = useCallback((row) => {
    const postId = commentSheetPostRef.current?.post_id;
    if (postId == null) return;
    setPosts((prev) =>
      prev.map((p) => {
        if (String(p?.post_id) !== String(postId)) return p;
        const raw = p?.Comments ?? p?.comments;
        const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
        return { ...p, Comments: [...list, row] };
      }),
    );
    setCommentSheetPost((prev) => {
      if (!prev || String(prev.post_id) !== String(postId)) return prev;
      const raw = prev?.Comments ?? prev?.comments;
      const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
      return { ...prev, Comments: [...list, row] };
    });
  }, []);

  useEffect(() => {
    if (!flipPost) {
      setFlipEntered(false);
      return;
    }
    setFlipEntered(false);
    let cancelled = false;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled) setFlipEntered(true);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [flipPost]);

  useEffect(() => {
    if (!flipPost && !commentSheetPost) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (commentSheetPost) {
        setCommentSheetPost(null);
        setCommentAccessPending(false);
        setCommentAccessReady(false);
        return;
      }
      closeFlipModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipPost, commentSheetPost, closeFlipModal]);

  const accountRows = useMemo(
    () =>
      ACCOUNT_PROVIDERS.map((provider) => {
        const identity =
          identities?.find((item) => item?.provider === provider) ?? null;
        const linked = Boolean(linkedProviders?.has(provider));
        return {
          provider,
          identity,
          linked,
          current: currentProvider === provider,
          email: identityEmail(identity),
          info: PROVIDER_INFO[provider],
        };
      }),
    [currentProvider, identities, linkedProviders],
  );
  const linkedProviderCount = accountRows.filter((row) => row.linked).length;

  const loadMyPageData = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setPostsLoaded(false);
      }
      setLoadError(null);

      if (!pageUserId) {
        clearMyPageSessionCache();
        setProfile(null);
        setPostCount(0);
        setPosts([]);
        setPostsLoaded(true);
        setLoadError(
          "로그인 계정과 연결된 사용자 정보를 찾지 못했습니다. Users.user_email을 확인해 주세요.",
        );
        return;
      }

      const cacheKey = String(pageUserId);

      try {
        const [profileUser, count, userPosts] = await Promise.all([
          getUserById(pageUserId),
          getUserPostCount(pageUserId),
          getPostsByUserId(pageUserId),
        ]);
        const arr = Array.isArray(userPosts) ? userPosts : [];
        const profileErr = !profileUser
          ? "사용자 정보를 불러오지 못했습니다."
          : null;
        if (profileErr) {
          setLoadError(profileErr);
        } else {
          setLoadError(null);
        }
        setProfile(profileUser);
        setPostCount(count);
        setPosts(arr);
        writeMyPageSessionCache({
          pageUserId: cacheKey,
          profile: profileUser,
          postCount: count,
          posts: arr,
          loadError: profileErr,
        });
      } catch {
        setLoadError(
          "게시글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
        if (!silent) {
          clearMyPageSessionCache();
        }
      } finally {
        setPostsLoaded(true);
      }
    },
    [pageUserId],
  );

  useEffect(() => {
    if (!pageUserId) {
      void loadMyPageData({ silent: false });
      return;
    }
    const snap = readMyPageSessionCache();
    if (
      snap &&
      snap.pageUserId === String(pageUserId) &&
      Array.isArray(snap.posts)
    ) {
      setProfile(snap.profile ?? null);
      setPostCount(snap.postCount ?? null);
      setPosts(snap.posts);
      setLoadError(snap.loadError ?? null);
      setPostsLoaded(true);
      return;
    }
    void loadMyPageData({ silent: false });
  }, [pageUserId, loadMyPageData]);

  const refreshFromWordmark = useCallback(() => {
    if (!pageUserId || postsRefreshing || !postsLoaded) return;
    setPostsRefreshing(true);
    void loadMyPageData({ silent: true }).finally(() => {
      setPostsRefreshing(false);
    });
  }, [pageUserId, postsRefreshing, postsLoaded, loadMyPageData]);

  const authName =
    user?.user_metadata?.user_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    (typeof user?.email === "string" ? user.email.split("@")[0] : "");
  const displayName = profile?.user_name || authName || "…";
  const handle = pageUserId
    ? `@userid${pageUserId}`
    : user?.email || "@unknown";
  /** 세션 사용자 ID에 묶인 DB 프로필 URL: 마이페이지 캐시·getUserById → Auth의 appUser 순 */
  const sessionUserProfileUrl =
    (typeof profile?.user_profile_url === "string" &&
      profile.user_profile_url.trim()) ||
    (typeof user?.appUser?.user_profile_url === "string" &&
      user.appUser.user_profile_url.trim()) ||
    "";
  const avatarSrc = resolvedProfileImageUrl(
    sessionUserProfileUrl ||
      (typeof user?.user_metadata?.user_profile_url === "string"
        ? user.user_metadata.user_profile_url.trim()
        : ""),
  );
  const meProfileRaw =
    sessionUserProfileUrl ||
    (typeof user?.user_metadata?.user_profile_url === "string" &&
      user.user_metadata.user_profile_url.trim()) ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    "";
  const isLoading = !postsLoaded;

  const linkProvider = async (provider) => {
    if (accountBusy) return;
    setAccountBusy(provider);
    setAccountError("");
    setAccountMessage("");
    rememberPendingIdentityLink(provider, "/mypage");

    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: authOptionsForProvider(provider),
    });

    if (error) {
      clearPendingIdentityLink();
      setAccountBusy("");
      setAccountError(
        error.message ||
          `${providerLabel(provider)} 계정 연결을 시작하지 못했습니다.`,
      );
    }
  };

  const unlinkProvider = async (provider, identity) => {
    if (accountBusy || !identity) return;
    const ok = window.confirm(`${providerLabel(provider)} 연결을 해제할까요?`);
    if (!ok) return;

    setAccountBusy(provider);
    setAccountError("");
    setAccountMessage("");

    try {
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) {
        setAccountError(
          error.message ||
            `${providerLabel(provider)} 연결을 해제하지 못했습니다.`,
        );
        return;
      }
      await refreshAuthState();
      setAccountMessage(`${providerLabel(provider)} 연결을 해제했습니다.`);
    } finally {
      setAccountBusy("");
    }
  };

  const handleLogout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        alert(error.message ?? "로그아웃하지 못했습니다.");
        return;
      }
      clearMyPageSessionCache();
      navigate("/login", { replace: true });
    } finally {
      setLogoutBusy(false);
    }
  };

  const handleDeleteCancel = useCallback(() => {
    if (deleteBusy) return;
    setDeleteConfirmPostId(null);
  }, [deleteBusy]);

  const handleDeleteConfirm = useCallback(async () => {
    const pid = deleteConfirmPostId;
    if (pid == null || !pageUserId) return;
    setDeleteBusy(true);
    try {
      const res = await deletePost({ postId: pid });
      if (!res.ok) {
        alert(res.error ?? "삭제하지 못했습니다.");
        return;
      }
      const nextPosts = posts.filter((p) => Number(p?.post_id) !== Number(pid));
      const nextCount =
        typeof postCount === "number"
          ? Math.max(0, postCount - 1)
          : nextPosts.length;
      setPosts(nextPosts);
      setPostCount(nextCount);
      writeMyPageSessionCache({
        pageUserId: String(pageUserId),
        profile,
        postCount: nextCount,
        posts: nextPosts,
        loadError: null,
      });
      setDeleteConfirmPostId(null);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteConfirmPostId, pageUserId, posts, postCount, profile]);

  /** @param {number} postIdNum */
  function longPressPropsFor(postIdNum) {
    return {
      onPointerDown: (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (blockLongPressRef.current) return;
        longPressRef.current.x = e.clientX;
        longPressRef.current.y = e.clientY;
        clearLongPressTimer();
        longPressRef.current.timer = window.setTimeout(() => {
          longPressRef.current.timer = null;
          longPressDidOpenDeleteRef.current = true;
          setDeleteConfirmPostId(postIdNum);
        }, MYPAGE_LONG_PRESS_MS);
      },
      onPointerMove: (e) => {
        if (longPressRef.current.timer == null) return;
        const dx = Math.abs(e.clientX - longPressRef.current.x);
        const dy = Math.abs(e.clientY - longPressRef.current.y);
        if (dx > MYPAGE_LONG_PRESS_MOVE_PX || dy > MYPAGE_LONG_PRESS_MOVE_PX) {
          clearLongPressTimer();
        }
      },
      onPointerUp: clearLongPressTimer,
      onPointerCancel: clearLongPressTimer,
    };
  }

  return (
    <>
      <section
        className="mypage-screen"
        aria-label="마이 페이지"
        aria-busy={isLoading || postsRefreshing || deleteBusy}
      >
        {postsRefreshing ? (
          <div
            className="mypage-refresh-overlay"
            role="status"
            aria-live="polite"
            aria-label="게시글을 새로고침하는 중"
          >
            <div className="mypage-refresh-spinner" aria-hidden />
          </div>
        ) : null}
        <header className="mypage-header">
          <button
            type="button"
            className="mypage-brand-btn"
            onClick={() => void refreshFromWordmark()}
            disabled={!pageUserId || postsRefreshing || isLoading}
            aria-label="MY GRAFFITI, 프로필 새로고침"
            title="새로고침"
          >
            <svg
              className="mypage-brand"
              viewBox="0 0 114 31"
              width={116}
              height={50}
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
              focusable="false"
              preserveAspectRatio="xMinYMid meet"
            >
              <path fill="#323646" d={MY_GRAFFITI_WORDMARK_PATH} />
            </svg>
          </button>
          <button
            type="button"
            className="mypage-logout"
            onClick={() => void handleLogout()}
            disabled={logoutBusy}
          >
            {logoutBusy ? "나가는 중…" : "로그아웃"}
          </button>
        </header>
        <div className="mypage-inner">
          {loadError ? (
            <p className="mypage-banner-error" role="status">
              {loadError}
            </p>
          ) : null}

          {isLoading ? (
            <div
              className="mypage-profile-card mypage-profile-card--skeleton"
              aria-hidden
            >
              <div className="mypage-skel mypage-skel-avatar" />
              <div className="mypage-skel-profile-lines">
                <div className="mypage-skel mypage-skel-name" />
                <div className="mypage-skel mypage-skel-handle" />
              </div>
            </div>
          ) : (
            <div className="mypage-profile-card">
              <img
                className="mypage-avatar"
                src={avatarSrc}
                alt=""
                width={49}
                height={49}
              />
              <div className="mypage-profile-text">
                <p className="mypage-name">{displayName}</p>
                <p className="mypage-handle">{handle}</p>
              </div>
            </div>
          )}

          {!isLoading ? (
            <section className="mypage-account" aria-label="소셜 계정 연결">
              <div className="mypage-account__header">
                <div>
                  <h2>소셜 계정</h2>
                  <p>
                    {currentProvider
                      ? `${providerLabel(currentProvider)}로 접속 중`
                      : "접속 provider를 확인하는 중"}
                  </p>
                </div>
              </div>

              {accountError ? (
                <p className="mypage-account__notice mypage-account__notice--error">
                  {accountError}
                </p>
              ) : null}
              {accountMessage ? (
                <p className="mypage-account__notice">{accountMessage}</p>
              ) : null}

              <div className="mypage-account__list">
                {accountRows.map((row) => {
                  const busy = accountBusy === row.provider;
                  const statusText = providerStatusText({
                    linked: row.linked,
                    current: row.current,
                  });
                  const canUnlink =
                    row.linked && !row.current && linkedProviderCount > 1;

                  return (
                    <div className="mypage-account__row" key={row.provider}>
                      <img
                        className="mypage-account__icon"
                        src={getProviderIcon(row.provider)}
                        alt=""
                        width={32}
                        height={32}
                      />
                      <div className="mypage-account__body">
                        <div className="mypage-account__title-row">
                          <p className="mypage-account__name">
                            {row.info.koLabel}
                          </p>
                          <span
                            className={`mypage-account__status${
                              row.current
                                ? " mypage-account__status--current"
                                : ""
                            }`}
                          >
                            {statusText}
                          </span>
                        </div>
                        <p className="mypage-account__meta">
                          {row.linked
                            ? row.email || "연결 완료"
                            : "아직 연결되지 않았어요"}
                        </p>
                        <div className="mypage-account__actions">
                          {!row.linked ? (
                            <button
                              type="button"
                              onClick={() => void linkProvider(row.provider)}
                              disabled={Boolean(accountBusy)}
                            >
                              {busy ? "연결 중..." : "연결"}
                            </button>
                          ) : null}
                          {canUnlink ? (
                            <button
                              type="button"
                              className="mypage-account__unlink"
                              onClick={() =>
                                void unlinkProvider(row.provider, row.identity)
                              }
                              disabled={Boolean(accountBusy)}
                            >
                              {busy ? "해제 중..." : "해제"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {isLoading ? (
            <div
              className="mypage-toolbar mypage-toolbar--skeleton"
              aria-hidden
            >
              <div className="mypage-skel mypage-skel-toolbar-count" />
              <div className="mypage-skel mypage-skel-toolbar-sort" />
            </div>
          ) : (
            <div className="mypage-toolbar">
              <p className="mypage-count">
                {postCount === null ? "… graffiti" : `${postCount} graffiti`}
              </p>
              <button
                type="button"
                className="mypage-sort"
                aria-pressed={sortOrder === "popular"}
                title={
                  sortOrder === "latest"
                    ? "눌러 인기순으로 보기"
                    : "눌러 최신순으로 보기"
                }
                onClick={() =>
                  setSortOrder((o) => (o === "latest" ? "popular" : "latest"))
                }
              >
                {sortOrder === "latest" ? "최신순" : "인기순"}
                <svg
                  className="mypage-sort__chev"
                  width={12}
                  height={12}
                  viewBox="0 0 12 12"
                  aria-hidden
                >
                  <path
                    fill="currentColor"
                    d="M6 8.2 2.35 4.55l.7-.7L6 6.8l3.05-2.95.7.7L6 8.2Z"
                  />
                </svg>
              </button>
            </div>
          )}

          <div className="mypage-grid">
            {isLoading ? (
              <MyPageGridSkeleton />
            ) : posts.length === 0 ? (
              <p className="mypage-grid-status">아직 작성한 글이 없습니다.</p>
            ) : (
              sortedPosts.map((post) => {
                const id = post?.post_id ?? Math.random();
                const cover = resolveAlbumCover(post);
                const place = resolvePlaceName(post);
                const time = formatRelativeKo(post?.post_created);
                const trackLine = resolveTrackLine(post);
                const postIdNum = Number(post?.post_id);
                const canLongPress = Number.isFinite(postIdNum);

                return (
                  <article
                    key={id}
                    className="mypage-card mypage-card--longpress"
                    {...(canLongPress ? longPressPropsFor(postIdNum) : {})}
                    onClick={() => {
                      if (longPressDidOpenDeleteRef.current) {
                        longPressDidOpenDeleteRef.current = false;
                        return;
                      }
                      setFlipPost({ ...post });
                    }}
                  >
                    <div className="mypage-card__media">
                      {cover ? (
                        <img
                          className="mypage-card__img"
                          src={cover}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <div className="mypage-card__placeholder" aria-hidden />
                      )}
                      <div className="mypage-card__shade" aria-hidden />
                      <div className="mypage-card__footer">
                        <p className="mypage-card__content">{trackLine}</p>
                        <div className="mypage-card__meta">
                          <span className="mypage-card__place">
                            <img
                              className="mypage-card__location-icon"
                              src="/location.png"
                              alt=""
                              width={11}
                              height={13}
                              decoding="async"
                            />
                            {place}
                          </span>
                          <span className="mypage-card__time">{time}</span>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>
      {!commentSheetPost ? <BottomNav /> : null}
      {flipPost ? (
        <div
          className="mypage-flip-overlay"
          role="presentation"
          onClick={() => closeFlipModal()}
        >
          {playbackNotice ? (
            <div className="mypage-flip-playback-notice" role="status">
              {playbackNotice}
            </div>
          ) : null}
          <div
            className="mypage-flip-shell"
            role="dialog"
            aria-modal="true"
            aria-label="포스트 미디어"
            onClick={(e) => e.stopPropagation()}
          >
            {showFlipTrackAbove ? (
              <div className="home-feed-item-track-slot">
                <div
                  className={`home-track-meta home-track-meta--above${
                    flipTrackMetaOnLightBg
                      ? " home-track-meta--above--light-bg"
                      : " home-track-meta--above--dark-bg"
                  }`}
                >
                  {flipTrackTitle ? (
                    <p className="home-track-title">{flipTrackTitle}</p>
                  ) : null}
                  {flipArtistName ? (
                    <p className="home-track-artist">{flipArtistName}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
            <article
              className={`home-card home-card--active mypage-flip-modal-card${
                flipEntered ? " home-card--flipped" : ""
              }`}
            >
              <div className="home-card-flip-inner">
                <div className="home-card-face home-card-face--front">
                  <button
                    type="button"
                    className="home-card-flip-trigger"
                    aria-expanded={flipEntered}
                    aria-label={
                      postMediaUrlsFromPost(flipDisplayPost ?? flipPost)
                        .length > 0
                        ? "업로드한 사진 보기"
                        : trackAlbumArtFromPost(flipDisplayPost ?? flipPost)
                          ? "앨범 표지 보기"
                          : "한 장 보기"
                    }
                    onClick={() => setFlipEntered(true)}
                  >
                    <div className="home-card-flip-trigger-media">
                      {trackAlbumArtFromPost(flipDisplayPost ?? flipPost) ? (
                        <img
                          className="home-card-image"
                          src={trackAlbumArtFromPost(
                            flipDisplayPost ?? flipPost,
                          )}
                          alt=""
                        />
                      ) : (
                        <div className="home-card-image home-card-image-empty" />
                      )}
                    </div>
                    <div className="home-card-top-shadow" aria-hidden />
                    <div className="home-card-bottom-shadow" aria-hidden />
                  </button>
                  <MyPageFlipCardChrome
                    fp={flipDisplayPost ?? flipPost}
                    displayName={displayName}
                    viewerProfileRaw={meProfileRaw}
                    likeUserId={user?.id}
                    likeStateByPostId={likeStateByPostId}
                    onLike={handleFlipLikeToggle}
                    onComment={tryOpenFlipCommentSheet}
                    onSpotify={openSpotifyTrack}
                    overlayShading={false}
                  />
                </div>
                <div
                  className="home-card-face home-card-face--back"
                  role="presentation"
                  onClick={(e) => {
                    const t = e.target;
                    if (
                      t instanceof Element &&
                      (t.closest(".home-user") ||
                        t.closest(".home-content") ||
                        t.closest(".home-actions"))
                    ) {
                      return;
                    }
                    closeFlipModal();
                  }}
                >
                  <div className="home-card-back-bg">
                    {(() => {
                      const fp = flipDisplayPost ?? flipPost;
                      const urls = postMediaUrlsFromPost(fp);
                      const albumArt = trackAlbumArtFromPost(fp);
                      const place = resolvePlaceName(fp);
                      if (urls.length > 0) {
                        return (
                          <MyPageFlipMediaStrip
                            urls={urls}
                            imageAlt={place || "포스트 사진"}
                          />
                        );
                      }
                      if (albumArt) {
                        return (
                          <img
                            className="home-card-image home-card-image--album-cover"
                            src={albumArt}
                            alt=""
                          />
                        );
                      }
                      return (
                        <div
                          className="home-card-image home-card-image-empty"
                          aria-hidden
                        />
                      );
                    })()}
                  </div>
                  <MyPageFlipCardChrome
                    fp={flipDisplayPost ?? flipPost}
                    displayName={displayName}
                    viewerProfileRaw={meProfileRaw}
                    likeUserId={user?.id}
                    likeStateByPostId={likeStateByPostId}
                    onLike={handleFlipLikeToggle}
                    onComment={tryOpenFlipCommentSheet}
                    onSpotify={openSpotifyTrack}
                    overlayShading
                  />
                </div>
              </div>
            </article>
          </div>
        </div>
      ) : null}
      <MyPageFlipCommentSheet
        open={Boolean(commentSheetPost)}
        post={commentSheetPost}
        appUserId={
          Number.isFinite(Number(pageUserId)) ? Number(pageUserId) : null
        }
        meProfileRaw={meProfileRaw}
        displayName={displayName}
        accessPending={commentAccessPending}
        accessReady={commentAccessReady}
        onClose={() => {
          setCommentSheetPost(null);
          setCommentAccessPending(false);
          setCommentAccessReady(false);
        }}
        onCommentCreated={handleFlipCommentRowCreated}
      />
      {deleteConfirmPostId != null ? (
        <div
          className="mypage-delete-overlay"
          role="presentation"
          onClick={() => {
            if (!deleteBusy) handleDeleteCancel();
          }}
        >
          <div
            className="mypage-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mypage-delete-title"
            aria-busy={deleteBusy}
            onClick={(e) => e.stopPropagation()}
          >
            <p id="mypage-delete-title" className="mypage-delete-dialog__title">
              삭제하시겠습니까?
            </p>
            <div className="mypage-delete-dialog__actions">
              <button
                type="button"
                className="mypage-delete-dialog__btn mypage-delete-dialog__btn--secondary"
                onClick={handleDeleteCancel}
                disabled={deleteBusy}
              >
                취소
              </button>
              <button
                type="button"
                className="mypage-delete-dialog__btn mypage-delete-dialog__btn--danger"
                onClick={() => void handleDeleteConfirm()}
                disabled={deleteBusy}
              >
                {deleteBusy ? "삭제 중…" : "확인"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
