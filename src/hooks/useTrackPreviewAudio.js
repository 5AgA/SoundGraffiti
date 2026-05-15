import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom/client";
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
  const eagerAutoplay = Boolean(options.eagerAutoplay);
  const audioRef = useRef(null);
  const requestRef = useRef(0);
  const previewCacheRef = useRef(new Map());
  const activePostRef = useRef(activePost);
  activePostRef.current = activePost;
  const [playbackActivated, setPlaybackActivated] = useState(false);
  const onUnavailableRef = useRef(options.onUnavailable);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  const previewGloballyMuted = Boolean(options.previewGloballyMuted);
  const muteRef = options.previewGloballyMutedRef;

  const activePostKey =
    activePost == null
      ? ""
      : activePost.post_id != null && activePost.post_id !== ""
        ? String(activePost.post_id)
        : "_";

  useEffect(() => {
    setPreviewUnavailable(false);
    setIsPreviewPlaying(false);
  }, [activePostKey]);

  useEffect(() => {
    onUnavailableRef.current = options.onUnavailable;
  }, [options.onUnavailable]);

  useEffect(() => {
    if (!previewGloballyMuted) return undefined;
    const a = audioRef.current;
    if (a && !a.paused) {
      a.pause();
    }
    setIsPreviewPlaying(false);
    return undefined;
  }, [previewGloballyMuted]);

  useEffect(() => {
    if (playbackActivated) return undefined;

    const activatePlayback = () => {
      setPlaybackActivated(true);
    };

    window.addEventListener("pointerdown", activatePlayback, true);
    window.addEventListener("keydown", activatePlayback, true);
    window.addEventListener("touchstart", activatePlayback, {
      capture: true,
      passive: true,
    });

    return () => {
      window.removeEventListener("pointerdown", activatePlayback, true);
      window.removeEventListener("keydown", activatePlayback, true);
      window.removeEventListener("touchstart", activatePlayback, {
        capture: true,
        passive: true,
      });
    };
  }, [playbackActivated]);

  const togglePreviewPlayback = useCallback(() => {
    if (previewUnavailable) return;

    if (!audioRef.current) {
      flushSync(() => {
        setPlaybackActivated(true);
      });
    }

    const a = audioRef.current;
    if (!a) return;

    if (a.paused) {
      void a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [previewUnavailable]);

  useLayoutEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (audioRef.current) {
      const prev = audioRef.current;
      prev.pause();
      prev.removeAttribute("src");
      prev.load();
      audioRef.current = null;
    }

    const track = getTrackFromPost(activePostRef.current);
    const mayStartPlayback = eagerAutoplay || playbackActivated;
    if (!track || !mayStartPlayback || document.hidden) return undefined;

    let cancelled = false;

    const syncPlaying = () => {
      if (cancelled || requestRef.current !== requestId) return;
      const a = audioRef.current;
      setIsPreviewPlaying(Boolean(a && !a.paused));
    };

    const notifyUnavailable = (reason) => {
      onUnavailableRef.current?.({ reason, track });
      if (reason === "no_preview" || reason === "preview_failed") {
        setPreviewUnavailable(true);
      }
    };

    const detachAudioListeners = (audio) => {
      if (!audio) return;
      audio.removeEventListener("play", syncPlaying);
      audio.removeEventListener("pause", syncPlaying);
      audio.removeEventListener("ended", syncPlaying);
    };

    const isMutedNow = () => Boolean(muteRef?.current);

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

      if (cancelled || requestRef.current !== requestId) return;

      const audio = new Audio(previewUrl);
      audio.preload = "auto";
      audio.volume = 0.82;
      audioRef.current = audio;

      audio.addEventListener("play", syncPlaying);
      audio.addEventListener("pause", syncPlaying);
      audio.addEventListener("ended", syncPlaying);

      audio.onerror = () => {
        if (cancelled || requestRef.current !== requestId) return;
        detachAudioListeners(audio);
        if (audioRef.current === audio) {
          audioRef.current.pause();
          audioRef.current.removeAttribute("src");
          audioRef.current.load();
          audioRef.current = null;
        }
        setIsPreviewPlaying(false);
        notifyUnavailable("preview_failed");
      };

      if (isMutedNow()) {
        setIsPreviewPlaying(false);
        return;
      }

      try {
        await audio.play();
        if (cancelled || requestRef.current !== requestId) return;
        setIsPreviewPlaying(!audio.paused);
      } catch (error) {
        if (cancelled || requestRef.current !== requestId) return;
        console.warn("Track preview playback failed:", error?.message || error);
        detachAudioListeners(audio);
        if (audioRef.current === audio) {
          audioRef.current.pause();
          audioRef.current.removeAttribute("src");
          audioRef.current.load();
          audioRef.current = null;
        }
        setIsPreviewPlaying(false);
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
      const a = audioRef.current;
      if (a) {
        detachAudioListeners(a);
        a.pause();
        a.removeAttribute("src");
        a.load();
        audioRef.current = null;
      }
      setIsPreviewPlaying(false);
    };
  }, [activePostKey, playbackActivated, eagerAutoplay]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return {
    previewUnavailable,
    isPreviewPlaying,
    togglePreviewPlayback,
  };
}
