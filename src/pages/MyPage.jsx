import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { getPostsByUserId } from "../api/posts";
import { getUserById, getUserPostCount } from "../api/users";
import { resolvedProfileImageUrl } from "../utils/profileImage";
import { supabase } from "../supabaseClient";
import "./MyPage.css";

const MY_PAGE_USER_ID = 3;

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
function resolveAlbumCover(post) {
  const t = post?.Tracks;
  const track = Array.isArray(t) ? t[0] : t;
  const album = track?.album_image_url?.trim?.();
  if (album) return album;

  const pm = post?.PostMedia;
  const list = Array.isArray(pm) ? pm : pm ? [pm] : [];
  const first = list[0];
  return first?.media_url?.trim?.() ?? "";
}

/** @param {Record<string, unknown>} post */
function resolvePlaceName(post) {
  const p = post?.Places;
  const row = Array.isArray(p) ? p[0] : p;
  return row?.place_name?.trim?.() || "장소 미설정";
}

/** @param {unknown} post */
function postBody(post) {
  const c = post?.content;
  return typeof c === "string" ? c.trim() : "";
}

/** @param {Record<string, unknown>} post */
function likeCount(post) {
  const likes = post?.Likes;
  return Array.isArray(likes) ? likes.length : 0;
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
    const d = likeCount(b) - likeCount(a);
    if (d !== 0) return d;
    return (
      new Date(String(b.post_created ?? 0)).getTime() -
      new Date(String(a.post_created ?? 0)).getTime()
    );
  });
  return copy;
}

const SKELETON_GRID_ITEMS = 8;

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

function PinIcon() {
  return (
    <svg
      className="mypage-card__pin"
      width={11}
      height={13}
      viewBox="0 0 11 13"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M5.5 0C3.02 0 1 2.02 1 4.6c0 3.21 4.5 7.95 4.7 8.15a.45.45 0 0 0 .6 0C6.5 12.55 11 7.81 11 4.6 11 2.02 8.98 0 5.5 0Zm0 6.25a1.65 1.65 0 1 1 0-3.3 1.65 1.65 0 0 1 0 3.3Z"
      />
    </svg>
  );
}

export default function MyPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [postCount, setPostCount] = useState(null);
  const [posts, setPosts] = useState([]);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [sortOrder, setSortOrder] = useState(
    /** @type {'latest' | 'popular'} */ ("latest"),
  );

  const sortedPosts = useMemo(
    () => sortMyPosts(posts, sortOrder),
    [posts, sortOrder],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadError(null);
      const [user, count, userPosts] = await Promise.all([
        getUserById(MY_PAGE_USER_ID),
        getUserPostCount(MY_PAGE_USER_ID),
        getPostsByUserId(MY_PAGE_USER_ID),
      ]);
      if (cancelled) return;
      if (!user) {
        setLoadError("사용자 정보를 불러오지 못했습니다.");
      }
      setProfile(user);
      setPostCount(count);
      setPosts(userPosts);
      setPostsLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = profile?.user_name ?? "…";
  const handle = `@userid${MY_PAGE_USER_ID}`;
  const avatarSrc = resolvedProfileImageUrl(profile?.user_profile_url);
  const isLoading = !postsLoaded;

  const handleLogout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        alert(error.message ?? "로그아웃하지 못했습니다.");
        return;
      }
      navigate("/login", { replace: true });
    } finally {
      setLogoutBusy(false);
    }
  };

  return (
    <>
      <section
        className="mypage-screen"
        aria-label="마이 페이지"
        aria-busy={isLoading}
      >
        <div className="mypage-inner">
          <header className="mypage-header">
            <div className="mypage-header-row">
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
              <button
                type="button"
                className="mypage-logout"
                onClick={() => void handleLogout()}
                disabled={logoutBusy}
              >
                {logoutBusy ? "나가는 중…" : "로그아웃"}
              </button>
            </div>
          </header>

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
                const body = postBody(post);

                return (
                  <article key={id} className="mypage-card">
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
                        {body ? (
                          <p className="mypage-card__content">{body}</p>
                        ) : null}
                        <div className="mypage-card__meta">
                          <span className="mypage-card__place">
                            <PinIcon />
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
      <BottomNav />
    </>
  );
}
