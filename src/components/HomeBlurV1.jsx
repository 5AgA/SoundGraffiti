import { useEffect, useRef, useState } from "react";
import "./HomeBlurV1.css";

function HomeBlurV1({ feed = [] }) {
  const posts = feed.length > 0 ? feed : [null];
  const [activeIndex, setActiveIndex] = useState(0);
  const cardRefs = useRef([]);
  const feedScrollRef = useRef(null);

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

  return (
    <section className="homev1-wrap">
      <div className="homev1-phone">
        <div className="homev1-bg-stack">
          <div
            className={`homev1-bg-blur${blurBackground ? "" : " no-image"}`}
            style={blurBackground ? { backgroundImage: `url(${blurBackground})` } : undefined}
          />
          <div className="homev1-bg-edge-fade homev1-bg-edge-fade--top" aria-hidden />
          <div className="homev1-bg-edge-fade homev1-bg-edge-fade--bottom" aria-hidden />
        </div>
        <div className="homev1-top-fade" />
        <div className="homev1-bottom-fade" />

        <header className="homev1-header">
          <h1>Soundgraffiti</h1>
        </header>

        <div
          className="homev1-feed-scroll"
          ref={feedScrollRef}
          onScroll={handleFeedScroll}
        >
          {posts.map((post, idx) => {
            const albumArt = post?.Tracks?.album_image_url || "";
            const avatar =
              post?.user_profile_url ||
              post?.profile_image_url ||
              post?.Users?.user_profile_url ||
              post?.Users?.profile_image_url ||
              "";
            const userName = post?.Users?.user_name || "UserId1234";
            const placeName = post?.Places?.place_name || "서울 홍대입구역";
            const content =
              post?.content ||
              "이 공간에는 르세라핌 'Spaghetti'처럼 텐션 있는 음악이 어울려요.";
            const likeCount = post?.Likes?.length || 12;
            const isActive = idx === activeIndex;

            return (
              <article
                className={`homev1-card${isActive ? " homev1-card--active" : ""}`}
                key={post?.post_id || idx}
                ref={(el) => {
                  cardRefs.current[idx] = el;
                }}
              >
                {albumArt ? (
                  <img className="homev1-card-image" src={albumArt} alt={placeName} />
                ) : (
                  <div className="homev1-card-image homev1-card-image-empty" />
                )}
                {isActive && (
                  <>
                    <div className="homev1-card-top-shadow" />
                    <div className="homev1-card-bottom-shadow" />

                    <div className="homev1-user">
                      {avatar ? (
                        <img className="homev1-avatar" src={avatar} alt={userName} />
                      ) : (
                        <div className="homev1-avatar" />
                      )}
                      <div>
                        <p className="homev1-name">{userName}</p>
                        <p className="homev1-place">{placeName}</p>
                      </div>
                    </div>

                    <p className="homev1-content">{content}</p>

                    <div className="homev1-actions">
                      <button type="button">♥ {likeCount}</button>
                      <button type="button">💬 5</button>
                      <button type="button">🎵</button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>

        <nav className="homev1-nav">
          <span className="is-active">⌂</span>
          <span>⌘</span>
          <span>◦</span>
        </nav>
        <button type="button" className="homev1-fab">
          +
        </button>
      </div>
    </section>
  );
}

export default HomeBlurV1;
