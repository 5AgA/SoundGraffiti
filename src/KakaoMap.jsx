import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

const escapeHtml = (value) =>
    String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

const createAlbumPinElement = (post) => {
    const element = document.createElement("button");
    const albumImageUrl = post.Tracks?.album_image_url;
    const trackTitle = post.Tracks?.track_title ?? "Unknown track";
    const artistName = post.Tracks?.artist_name ?? "Unknown artist";

    element.type = "button";
    element.className = `album-map-pin${albumImageUrl ? "" : " is-empty"}`;
    element.setAttribute("aria-label", `${trackTitle} - ${artistName}`);

    if (albumImageUrl) {
        const image = document.createElement("img");
        image.src = albumImageUrl;
        image.alt = "";
        image.className = "album-map-pin__image";
        element.appendChild(image);
    }
    else {
        const fallback = document.createElement("span");
        fallback.className = "album-map-pin__fallback";
        fallback.textContent = "♪";
        element.appendChild(fallback);
    }

    return element;
};

function KakaoMap() {
    const mapRef = useRef(null);
    const [posts, setPosts] = useState([]);

    // retrieve data from supabase
    useEffect(() => {
        async function fetchPosts() {
            const { data, error } = await supabase
            .from("Posts")
            .select(`
                post_id,
                content,
                Places (
                    place_name,
                    latitude,
                    longitude
                ),
                Tracks (
                    track_title,
                    artist_name,
                    album_image_url
                )
            `)
            .eq("status", "published");

            if (error) {
                console.error("Failed to receive data:", error);
            }
            else {
                console.log("Received data:", data);
                setPosts(data);
            }
        }

        fetchPosts();
    }, []);

    // put marker on map & perform clustering
    useEffect(() => {
        if (posts.length === 0) return;
        if (!mapRef.current || !window.kakao?.maps?.load) {
            console.warn("Kakao Maps SDK is not ready.");
            return;
        }

        let cancelled = false;
        let overlays = [];
        let infowindows = [];

        window.kakao.maps.load(() => {
            if (cancelled) return;

            const map = new window.kakao.maps.Map(mapRef.current, {
                center: new window.kakao.maps.LatLng(37.5665, 126.978),
                level: 7,
            });
            const bounds = new window.kakao.maps.LatLngBounds();

            // create album image pins
            overlays = posts
            .filter((post) => post.Places)
            .map((post) => {
                const position = new window.kakao.maps.LatLng(
                    post.Places.latitude,
                    post.Places.longitude
                );
                const pinElement = createAlbumPinElement(post);
                const overlay = new window.kakao.maps.CustomOverlay({
                    position,
                    content: pinElement,
                    xAnchor: 0.5,
                    yAnchor: 0.5,
                    zIndex: 10,
                });

                const infowindow = new window.kakao.maps.InfoWindow({
                    position,
                    content: `
                        <div style="padding:8px 10px;font-size:12px;line-height:1.4;max-width:190px;">
                            <strong>${escapeHtml(post.Places.place_name)}</strong><br/>
                            ${escapeHtml(post.Tracks?.track_title ?? "Unknown track")}
                            <span style="color:#777;">- ${escapeHtml(post.Tracks?.artist_name ?? "Unknown artist")}</span><br/>
                            ${escapeHtml(post.content)}
                        </div>
                    `,
                });

                overlay.setMap(map);
                pinElement.addEventListener("click", () => {
                    infowindows.forEach((info) => info.close());
                    infowindow.open(map);
                });
                bounds.extend(position);
                infowindows.push(infowindow);

                return overlay;
            });

            if (overlays.length > 0) {
                map.setBounds(bounds);
            }
        });

        return () => {
            cancelled = true;
            overlays.forEach((overlay) => overlay.setMap(null));
            infowindows.forEach((info) => info.close());
        };
    }, [posts]);

    return (
        <div
        ref={mapRef}
        className="sound-map"
        />
    );
}

export default KakaoMap;
