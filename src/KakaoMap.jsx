import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMapPosts } from "./api/posts";
import "./KakaoMap.css";
import { getDevGeoCoordinates } from "./utils/devGeoCoords";

const SEOUL_CENTER = { latitude: 37.5665, longitude: 126.978 };
const KAKAO_MAP_SDK_SRC = "https://dapi.kakao.com/v2/maps/sdk.js";

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

const getPinSize = (postCount) => {
  const scale = Math.log2(Math.max(postCount, 1));
  return Math.round(48 + Math.min(scale * 9, 32));
};

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

  element.type = "button";
  element.className = `album-map-pin${albumImageUrl ? "" : " is-empty"}${
    placeGroup.posts.length > 1 ? " has-multiple-posts" : ""
  }`;
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
  const [posts, setPosts] = useState([]);
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

  useEffect(() => {
    let cancelled = false;

    async function fetchPosts(coords = null) {
      const { posts: mapPosts, error } = await getMapPosts(
        coords?.lat,
        coords?.lng,
      );

      if (cancelled) return;
      if (error) {
        console.error("Failed to receive map posts:", error);
        setPosts([]);
        return;
      }

      setPosts(Array.isArray(mapPosts) ? mapPosts : []);
    }

    const insecure = typeof window !== "undefined" && !window.isSecureContext;
    const devCoords = getDevGeoCoordinates();

    if (insecure && devCoords) {
      void fetchPosts(devCoords);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void fetchPosts({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {
          void fetchPosts();
        },
        {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 120000,
        },
      );
    } else {
      void fetchPosts();
    }

    return () => {
      cancelled = true;
    };
  }, []);

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

    if (visibleGroups.length > 0 && !hasFitBoundsRef.current) {
      map.setBounds(bounds);
      hasFitBoundsRef.current = true;
    }

    return () => {
      cleanupListeners.forEach((cleanup) => cleanup());
      overlays.forEach((overlay) => overlay.setMap(null));
    };
  }, [isMapReady, visibleGroups]);

  const closeSheet = () => {
    setIsSheetClosing(true);
    setSheetDragY(140);

    window.setTimeout(() => {
      setSelectedPlace(null);
      setActiveTrackIndex(0);
      setSheetDragY(0);
      setIsSheetClosing(false);
      setIsSheetDragging(false);
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

  return (
    <div className="sound-map-shell">
      <div ref={mapContainerRef} className="sound-map" />

      {selectedPlace && <div className="map-sheet-backdrop" />}

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

              return (
                <article
                  className={`map-track-card${
                    post?.within_feed_radius ? " is-feed-link" : ""
                  }`}
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
                        alt={trackTitle}
                      />
                    ) : (
                      <div className="map-track-art map-track-art-empty">♪</div>
                    )}
                    <div className="map-track-user">
                      <span className="map-track-user-dot" />
                      <span>{getUserName(post)}</span>
                    </div>
                  </div>
                  <h2 className="map-track-title">{trackTitle}</h2>
                  <p className="map-track-artist">{artistName}</p>
                </article>
              );
            })}
          </div>

          <div className="map-track-dots" aria-hidden="true">
            {selectedTracks.map((post, index) => (
              <span
                className={index === activeTrackIndex ? "is-active" : ""}
                key={post.post_id}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default KakaoMap;
