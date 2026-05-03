import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

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

        window.kakao.maps.load(() => {
            const map = new window.kakao.maps.Map(mapRef.current, {
                center: new window.kakao.maps.LatLng(37.5665, 126.978),
                level: 7,
            });

            // create markers
            const markers = posts
            .filter((post) => post.Places)
            .map((post) => {
                const marker = new window.kakao.maps.Marker({
                    position: new window.kakao.maps.LatLng(
                        post.Places.latitude,
                        post.Places.longitude
                    ),
                });

                // when marker is clicked -> opens info window (temp)
                const infowindow = new window.kakao.maps.InfoWindow({
                    content: `<div style="padding:5px;font-size:12px;">${post.Places.place_name}<br/>${post.content}</div>`,
                });

                window.kakao.maps.event.addListener(marker, "click", () => {
                    infowindow.open(map, marker);
                });

                return marker;
            });

            // apply clusterer
            new window.kakao.maps.MarkerClusterer({
                map: map,
                markers: markers,
                gridSize: 60,
                minLevel: 5,
            });
        });
    }, [posts]);

    return (
        <div
        ref={mapRef}
        style={{ width: "100%", height: "500px" }}
        />
    );
}

export default KakaoMap;
