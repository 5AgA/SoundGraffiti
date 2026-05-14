import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMapPosts } from "./api/posts";
import "./KakaoMap.css";
import { getDevGeoCoordinates } from "./utils/devGeoCoords";
import { resolvedProfileImageUrl } from "./utils/profileImage";
import {
  readMapSessionCache,
  writeMapSessionCache,
} from "./utils/mapSessionCache";
import { MAP_RECENTER_USER_EVENT } from "./constants/appEvents";

const SEOUL_CENTER = { latitude: 37.5665, longitude: 126.978 };
const KAKAO_MAP_SDK_SRC = "https://dapi.kakao.com/v2/maps/sdk.js";
const MAX_VISIBLE_DOTS = 5;
const DISTANCE_LOCKED_MESSAGE = "200m 이내 노래만 확인할 수 있어요";
/** 내 위치로 맞출 때 카카오 맵 zoom level (숫자가 작을수록 더 확대) */
const MAP_USER_ZOOM_LEVEL = 4;

let kakaoMapsSdkPromise = null;

function buildKakaoMapsSdkSrc() {
  const appKey = import.meta.env.VITE_KAKAO_MAP_KEY;
  const params = new URLSearchParams({
    appkey: appKey ?? "",
    libraries: "clusterer",
    autoload: "false",
  });

  return `${KAKAO_MAP_SDK_SRC}?${params.toString()}`;
}

function waitForKakaoMapsSdk() {
  if (window.kakao?.maps?.load) {
    return Promise.resolve(window.kakao);
  }

  if (kakaoMapsSdkPromise) return kakaoMapsSdkPromise;

  kakaoMapsSdkPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      if (window.kakao?.maps?.load) {
        settled = true;
        resolve(window.kakao);
      }
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      reject(new Error("Failed to load Kakao Maps SDK."));
    };
    const interval = window.setInterval(finish, 50);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      fail();
    }, 10000);
    const cleanup = () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };

    const script =
      document.querySelector('script[src*="dapi.kakao.com/v2/maps/sdk.js"]') ??
      document.createElement("script");

    script.addEventListener(
      "load",
      () => {
        finish();
        if (settled) cleanup();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        cleanup();
        fail();
      },
      { once: true },
    );

    if (!script.parentNode) {
      script.type = "text/javascript";
      script.src = buildKakaoMapsSdkSrc();
      document.head.appendChild(script);
    }

    const existingCheck = window.setInterval(() => {
      finish();
      if (settled) {
        window.clearInterval(existingCheck);
        cleanup();
      }
    }, 50);
  });

  return kakaoMapsSdkPromise;
}

const getPlaceKey = (post) => {
  const place = post?.Places;
  return `${place?.place_name ?? "unknown"}-${place?.latitude ?? ""}-${place?.longitude ?? ""}`;
};

const getUserName = (post) => {
  const user = Array.isArray(post?.Users) ? post.Users[0] : post?.Users;
  return user?.user_name || post?.user_name || "anonymous";
};

const getUserProfileImage = (post) => {
  const user = Array.isArray(post?.Users) ? post.Users[0] : post?.Users;
  return resolvedProfileImageUrl(
    user?.user_profile_url ||
      post?.user_profile_url ||
      user?.profile_image_url ||
      post?.profile_image_url,
  );
};

const getVisibleDotRange = (total, activeIndex) => {
  if (total <= MAX_VISIBLE_DOTS) {
    return { start: 0, end: total };
  }

  const half = Math.floor(MAX_VISIBLE_DOTS / 2);
  let start = Math.max(0, activeIndex - half);
  let end = start + MAX_VISIBLE_DOTS;

  if (end > total) {
    end = total;
    start = Math.max(0, end - MAX_VISIBLE_DOTS);
  }

  return { start, end };
};

const getPinSize = (postCount) => {
  const scale = Math.log2(Math.max(postCount, 1));
  return Math.round(48 + Math.min(scale * 9, 32));
};

const isDistanceLockedPost = (post) => post?.within_feed_radius === false;

const getClusterCellSize = (level) => {
  if (level <= 4) return 0;
  return 0.003 * 2 ** (level - 5);
};

const createAlbumPinElement = (placeGroup) => {
  const element = document.createElement("button");
  const featuredPost = placeGroup.posts[0];
  const albumImageUrl = featuredPost?.Tracks?.album_image_url;
  const placeName = placeGroup.place.place_name ?? "Unknown place";
  const pinSize = getPinSize(placeGroup.posts.length);
  const isDistanceLocked = isDistanceLockedPost(featuredPost);

  element.type = "button";
  element.className = `album-map-pin${albumImageUrl ? "" : " is-empty"}${
    placeGroup.posts.length > 1 ? " has-multiple-posts" : ""
  }${isDistanceLocked ? " is-distance-locked" : ""}`;
  element.style.setProperty("--pin-size", `${pinSize}px`);
  element.setAttribute("aria-label", `${placeName} music posts`);

  if (albumImageUrl) {
    const image = document.createElement("img");
    image.src = albumImageUrl;
    image.alt = "";
    image.className = "album-map-pin__image";
    element.appendChild(image);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "album-map-pin__fallback";
    fallback.textContent = "♪";
    element.appendChild(fallback);
  }

  return element;
};

function KakaoMap() {
  const navigate = useNavigate();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const carouselRef = useRef(null);
  const hasFitBoundsRef = useRef(false);
  const dragStartYRef = useRef(null);
  const sheetCloseLockRef = useRef(false);
  const isMountedRef = useRef(true);
  const enableAutoFitBoundsRef = useRef(false);
  const myLocationOverlayRef = useRef(null);
  const [posts, setPosts] = useState([]);
  const [mapRefreshing, setMapRefreshing] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(7);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const [isSheetClosing, setIsSheetClosing] = useState(false);

  const placeGroups = useMemo(() => {
    const groups = new Map();

    posts
      .filter((post) => post?.Places?.latitude && post?.Places?.longitude)
      .forEach((post) => {
        const key = getPlaceKey(post);
        const current = groups.get(key);

        if (current) {
          current.posts.push(post);
          return;
        }

        groups.set(key, {
          key,
          place: post.Places,
          posts: [post],
        });
      });

    return Array.from(groups.values());
  }, [posts]);

  const visibleGroups = useMemo(() => {
    const cellSize = getClusterCellSize(zoomLevel);
    if (!cellSize) return placeGroups;

    const clusters = new Map();

    placeGroups.forEach((group) => {
      const latBucket = Math.round(group.place.latitude / cellSize);
      const lngBucket = Math.round(group.place.longitude / cellSize);
      const key = `${latBucket}-${lngBucket}`;
      const cluster = clusters.get(key);

      if (cluster) {
        cluster.sourceGroups.push(group);
        cluster.posts.push(...group.posts);
        cluster.latitudeTotal += group.place.latitude;
        cluster.longitudeTotal += group.place.longitude;
        return;
      }

      clusters.set(key, {
        key,
        sourceGroups: [group],
        posts: [...group.posts],
        latitudeTotal: group.place.latitude,
        longitudeTotal: group.place.longitude,
      });
    });

    return Array.from(clusters.values()).map((cluster) => {
      const placeCount = cluster.sourceGroups.length;
      const firstPlaceName = cluster.sourceGroups[0]?.place?.place_name;

      return {
        key: cluster.key,
        place: {
          place_name: placeCount > 1 ? `${firstPlaceName} 근처` : firstPlaceName,
          latitude: cluster.latitudeTotal / placeCount,
          longitude: cluster.longitudeTotal / placeCount,
        },
        posts: cluster.posts,
      };
    });
  }, [placeGroups, zoomLevel]);

  const resolveMapCoords = useCallback(async () => {
    const insecure = typeof window !== "undefined" && !window.isSecureContext;
    const devCoords = getDevGeoCoordinates();
    if (insecure && devCoords) {
      return { lat: devCoords.lat, lng: devCoords.lng };
    }
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      return await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          () => resolve(null),
          {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 120000,
          },
        );
      });
    }
    return null;
  }, []);

  const runMyLocationFocus = useCallback(async () => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps) return;

    const c = await resolveMapCoords();
    if (!c || mapInstanceRef.current !== map) return;

    const pos = new window.kakao.maps.LatLng(c.lat, c.lng);
    map.setCenter(pos);
    map.setLevel(MAP_USER_ZOOM_LEVEL);
    setZoomLevel(map.getLevel());

    myLocationOverlayRef.current?.setMap(null);
    const el = document.createElement("div");
    el.className = "map-my-location-dot";
    el.title = "내 위치";

    const overlay = new window.kakao.maps.CustomOverlay({
      position: pos,
      content: el,
      xAnchor: 0.5,
      yAnchor: 0.5,
      zIndex: 25,
    });
    overlay.setMap(map);
    myLocationOverlayRef.current = overlay;
  }, [resolveMapCoords]);

  const loadMapPosts = useCallback(async (options = {}) => {
    const { fitBoundsAfter = false } = options;
    setMapRefreshing(true);
    hasFitBoundsRef.current = false;
    setSelectedPlace(null);
    setActiveTrackIndex(0);
    try {
      const coords = await resolveMapCoords();
      if (!isMountedRef.current) return;
      const { posts: mapPosts, error } = await getMapPosts(
        coords?.lat,
        coords?.lng,
      );
      if (!isMountedRef.current) return;
      if (error) {
        console.error("Failed to receive map posts:", error);
        setPosts([]);
        writeMapSessionCache([]);
        return;
      }
      const arr = Array.isArray(mapPosts) ? mapPosts : [];
      setPosts(arr);
      writeMapSessionCache(arr);
      if (fitBoundsAfter) {
        enableAutoFitBoundsRef.current = true;
        hasFitBoundsRef.current = false;
      } else {
        enableAutoFitBoundsRef.current = false;
      }
    } finally {
      if (isMountedRef.current) setMapRefreshing(false);
    }
  }, [resolveMapCoords]);

  const handleLogoRefresh = useCallback(async () => {
    await loadMapPosts({ fitBoundsAfter: false });
    await runMyLocationFocus();
  }, [loadMapPosts, runMyLocationFocus]);

  useEffect(() => {
    isMountedRef.current = true;
    const snap = readMapSessionCache();
    if (snap != null && Array.isArray(snap.posts)) {
      setPosts(snap.posts);
    } else {
      void loadMapPosts();
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [loadMapPosts]);

  /** 지도 탭 진입: 내 위치로 이동·줌인 + 내 위치 표시 */
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current || !window.kakao?.maps) {
      return undefined;
    }

    let cancelled = false;

    void (async () => {
      await runMyLocationFocus();
      if (cancelled) {
        myLocationOverlayRef.current?.setMap(null);
        myLocationOverlayRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      myLocationOverlayRef.current?.setMap(null);
      myLocationOverlayRef.current = null;
    };
  }, [isMapReady, runMyLocationFocus]);

  useEffect(() => {
    const onRecenter = () => {
      if (!isMapReady || !mapInstanceRef.current || !window.kakao?.maps) {
        return;
      }
      void runMyLocationFocus();
    };
    window.addEventListener(MAP_RECENTER_USER_EVENT, onRecenter);
    return () => window.removeEventListener(MAP_RECENTER_USER_EVENT, onRecenter);
  }, [isMapReady, runMyLocationFocus]);

  useEffect(() => {
    let cancelled = false;
    let removeZoomListener = null;

    waitForKakaoMapsSdk()
      .then((kakao) => {
        if (cancelled || !mapContainerRef.current) return;

        kakao.maps.load(() => {
          if (cancelled || !mapContainerRef.current) return;

          const center = new kakao.maps.LatLng(
            SEOUL_CENTER.latitude,
            SEOUL_CENTER.longitude,
          );
          const map = new kakao.maps.Map(mapContainerRef.current, {
            center,
            level: 7,
          });
          const handleZoomChanged = () => {
            setZoomLevel(map.getLevel());
          };

          mapInstanceRef.current = map;
          setZoomLevel(map.getLevel());
          setIsMapReady(true);
          kakao.maps.event.addListener(map, "zoom_changed", handleZoomChanged);
          removeZoomListener = () => {
            kakao.maps.event.removeListener(
              map,
              "zoom_changed",
              handleZoomChanged,
            );
          };
        });
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Kakao Maps SDK is not ready.", error);
        }
      });

    return () => {
      cancelled = true;
      removeZoomListener?.();
      mapInstanceRef.current = null;
      setIsMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!isMapReady || !map || !window.kakao?.maps) return undefined;

    const overlays = [];
    const cleanupListeners = [];
    const bounds = new window.kakao.maps.LatLngBounds();

    visibleGroups.forEach((placeGroup) => {
      const position = new window.kakao.maps.LatLng(
        placeGroup.place.latitude,
        placeGroup.place.longitude,
      );
      const pinElement = createAlbumPinElement(placeGroup);
      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        content: pinElement,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 10,
      });
      const handlePinClick = () => {
        setSelectedPlace(placeGroup);
        setActiveTrackIndex(0);
      };

      overlay.setMap(map);
      pinElement.addEventListener("click", handlePinClick);
      cleanupListeners.push(() => {
        pinElement.removeEventListener("click", handlePinClick);
      });
      overlays.push(overlay);
      bounds.extend(position);
    });

    if (
      visibleGroups.length > 0 &&
      !hasFitBoundsRef.current &&
      enableAutoFitBoundsRef.current
    ) {
      map.setBounds(bounds);
      hasFitBoundsRef.current = true;
    }

    return () => {
      cleanupListeners.forEach((cleanup) => cleanup());
      overlays.forEach((overlay) => overlay.setMap(null));
    };
  }, [isMapReady, visibleGroups]);

  const closeSheet = () => {
    if (sheetCloseLockRef.current) return;
    sheetCloseLockRef.current = true;
    setIsSheetClosing(true);
    setSheetDragY(140);

    window.setTimeout(() => {
      setSelectedPlace(null);
      setActiveTrackIndex(0);
      setSheetDragY(0);
      setIsSheetClosing(false);
      setIsSheetDragging(false);
      sheetCloseLockRef.current = false;
    }, 220);
  };

  useEffect(() => {
    if (!selectedPlace) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      if (!carouselRef.current) return;

      carouselRef.current.scrollLeft = 0;
      setActiveTrackIndex(0);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [selectedPlace]);

  const handleCarouselScroll = (event) => {
    const carousel = event.currentTarget;
    const card = carousel.querySelector(".map-track-card");
    if (!card) return;

    const gap = Number.parseFloat(window.getComputedStyle(carousel).gap) || 0;
    const step = card.getBoundingClientRect().width + gap;
    if (!step) return;

    setActiveTrackIndex(Math.round(carousel.scrollLeft / step));
  };

  const scrollToTrack = (index) => {
    const carousel = carouselRef.current;
    const card = carousel?.querySelector(".map-track-card");
    if (!carousel || !card || index === activeTrackIndex) return;

    const gap = Number.parseFloat(window.getComputedStyle(carousel).gap) || 0;
    const step = card.getBoundingClientRect().width + gap;

    carousel.scrollTo({
      left: step * index,
      behavior: "smooth",
    });
    setActiveTrackIndex(index);
  };

  const handleTrackCardClick = (post, index) => {
    if (post?.within_feed_radius && post?.post_id != null) {
      navigate(`/home?postId=${encodeURIComponent(post.post_id)}`);
      return;
    }

    scrollToTrack(index);
  };

  const handleSheetPointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStartYRef.current = event.clientY;
    setIsSheetDragging(true);
  };

  const handleSheetPointerMove = (event) => {
    const dragStartY = dragStartYRef.current;
    if (dragStartY === null) return;

    setSheetDragY(Math.max(0, event.clientY - dragStartY));
  };

  const handleSheetPointerUp = (event) => {
    const dragStartY = dragStartYRef.current;
    dragStartYRef.current = null;
    setIsSheetDragging(false);

    if (dragStartY !== null && event.clientY - dragStartY > 56) {
      closeSheet();
      return;
    }

    setSheetDragY(0);
  };

  const selectedTracks = selectedPlace?.posts ?? [];
  const dotRange = getVisibleDotRange(selectedTracks.length, activeTrackIndex);
  const visibleDotTracks = selectedTracks.slice(dotRange.start, dotRange.end);

  return (
    <div
      className={`sound-map-shell${
        selectedPlace ? " sound-map-shell--sheet-open" : ""
      }`}
    >
      <div ref={mapContainerRef} className="sound-map" />

      <header className="map-header" aria-label="Graffiti Map">
        <button
          type="button"
          className="map-logo-btn"
          onClick={() => void handleLogoRefresh()}
          disabled={mapRefreshing}
          aria-label="Graffiti Map, 포스트 새로고침 및 내 위치로 이동"
          title="새로고침 · 내 위치"
        >
          <img
            className="map-logo"
            src="/GraffitiMap.svg"
            alt=""
            draggable={false}
          />
        </button>
      </header>

      {selectedPlace && (
        <button
          type="button"
          className="map-sheet-backdrop"
          aria-label="뒤쪽 배경을 눌러 닫기"
          onClick={closeSheet}
          onPointerDown={closeSheet}
        />
      )}

      {selectedPlace && (
        <section
          className={`map-music-sheet${isSheetDragging ? " is-dragging" : ""}${
            isSheetClosing ? " is-closing" : ""
          }`}
          style={{ "--sheet-drag-y": `${sheetDragY}px` }}
          aria-label="Music at selected place"
        >
          <button
            type="button"
            className="map-sheet-handle"
            aria-label="Drag down to close"
            onPointerDown={handleSheetPointerDown}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={handleSheetPointerUp}
            onPointerCancel={handleSheetPointerUp}
            onClick={closeSheet}
          />
          <p className="map-sheet-place">
            <span aria-hidden="true">●</span>
            {selectedPlace.place.place_name ?? "Unknown place"}
          </p>

          <div
            ref={carouselRef}
            className="map-track-carousel"
            onScroll={handleCarouselScroll}
          >
            {selectedTracks.map((post, index) => {
              const albumImageUrl = post?.Tracks?.album_image_url;
              const trackTitle = post?.Tracks?.track_title ?? "Unknown track";
              const artistName = post?.Tracks?.artist_name ?? "Unknown artist";
              const userName = getUserName(post);
              const profileImageUrl = getUserProfileImage(post);
              const isDistanceLocked = isDistanceLockedPost(post);

              return (
                <article
                  className={`map-track-card${
                    post?.within_feed_radius ? " is-feed-link" : ""
                  }${isDistanceLocked ? " is-distance-locked" : ""}`}
                  key={post.post_id}
                  onClick={() => handleTrackCardClick(post, index)}
                  title={
                    post?.within_feed_radius
                      ? "피드에서 이 게시물 보기"
                      : undefined
                  }
                >
                  <div className="map-track-art-wrap">
                    {albumImageUrl ? (
                      <img
                        className="map-track-art"
                        src={albumImageUrl}
                        alt={isDistanceLocked ? "" : trackTitle}
                      />
                    ) : (
                      <div className="map-track-art map-track-art-empty">♪</div>
                    )}
                    <div className="map-track-user">
                      <img
                        className="map-track-user-avatar"
                        src={profileImageUrl}
                        alt=""
                        draggable={false}
                      />
                      <span>{userName}</span>
                    </div>
                  </div>
                  {isDistanceLocked ? (
                    <p className="map-track-locked-message">
                      {DISTANCE_LOCKED_MESSAGE}
                    </p>
                  ) : (
                    <>
                      <h2 className="map-track-title">{trackTitle}</h2>
                      <p className="map-track-artist">{artistName}</p>
                    </>
                  )}
                </article>
              );
            })}
          </div>

          <div className="map-track-dots" aria-hidden="true">
            {visibleDotTracks.map((post, offset) => {
              const index = dotRange.start + offset;
              const fadesLeft = dotRange.start > 0 && offset === 0;
              const fadesRight =
                dotRange.end < selectedTracks.length &&
                offset === visibleDotTracks.length - 1;

              return (
                <span
                  className={`${index === activeTrackIndex ? "is-active" : ""}${
                    fadesLeft || fadesRight ? " is-faded" : ""
                  }`}
                  key={post.post_id}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default KakaoMap;
