import { useEffect, useRef, useState } from "react";
import { resolveTrackPreview } from "../api/trackPreview";

function getTrackFromPost(post) {
  const raw = post?.Tracks ?? post?.tracks;
  if (raw == null) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

function getTrackTitle(track) {
  return typeof track?.track_title === "string"
    ? track.track_title.trim()
    : "";
}

function getTrackArtist(track) {
  return typeof track?.artist_name === "string" ? track.artist_name.trim() : "";
}

function getPreviewUrl(track) {
  return typeof track?.preview_url === "string" ? track.preview_url.trim() : "";
}

function cacheKeyForTrack(track) {
  const id = typeof track?.track_id === "string" ? track.track_id.trim() : "";
  if (id) return id;
  return `${getTrackTitle(track)}::${getTrackArtist(track)}`;
}

export function useTrackPreviewAudio(activePost, options = {}) {
  const audioRef = useRef(null);
  const requestRef = useRef(0);
  const previewCacheRef = useRef(new Map());
  const userInteractedRef = useRef(false);
  const onUnavailableRef = useRef(options.onUnavailable);
  const [playbackActivated, setPlaybackActivated] = useState(false);

  useEffect(() => {
    onUnavailableRef.current = options.onUnavailable;
  }, [options.onUnavailable]);

  useEffect(() => {
    if (playbackActivated) return undefined;

    const activatePlayback = () => {
      userInteractedRef.current = true;
      setPlaybackActivated(true);
    };

    window.addEventListener("pointerdown", activatePlayback);
    window.addEventListener("keydown", activatePlayback);
    window.addEventListener("touchstart", activatePlayback, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", activatePlayback);
      window.removeEventListener("keydown", activatePlayback);
      window.removeEventListener("touchstart", activatePlayback);
    };
  }, [playbackActivated]);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }

    const track = getTrackFromPost(activePost);
    if (!track || !playbackActivated || document.hidden) return undefined;

    let cancelled = false;

    const notifyUnavailable = (reason) => {
      onUnavailableRef.current?.({ reason, track });
    };

    const play = async () => {
      const key = cacheKeyForTrack(track);
      let previewUrl = getPreviewUrl(track) || previewCacheRef.current.get(key);

      if (!previewUrl) {
        const resolved = await resolveTrackPreview(track);
        if (cancelled || requestRef.current !== requestId) return;
        previewUrl = resolved?.previewUrl || "";
        if (previewUrl) {
          previewCacheRef.current.set(key, previewUrl);
        }
      }

      if (!previewUrl) {
        notifyUnavailable("no_preview");
        return;
      }

      const audio = new Audio(previewUrl);
      audio.preload = "auto";
      audio.volume = 0.82;
      audioRef.current = audio;

      audio.onerror = () => {
        if (!cancelled && requestRef.current === requestId) {
          notifyUnavailable("preview_failed");
        }
      };

      try {
        await audio.play();
      } catch (error) {
        if (cancelled || requestRef.current !== requestId) return;
        console.warn("Track preview playback failed:", error?.message || error);
        notifyUnavailable(
          error?.name === "NotAllowedError"
            ? "interaction_required"
            : "preview_failed",
        );
      }
    };

    void play();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        audioRef.current?.pause();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
        audioRef.current = null;
      }
    };
  }, [activePost, playbackActivated]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);
}
