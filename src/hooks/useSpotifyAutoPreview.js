import { useEffect, useRef, useState } from "react";

const SPOTIFY_SDK_SRC = "https://sdk.scdn.co/spotify-player.js";
const DEFAULT_LOOP_MS = 30000;
const DEVICE_SETTLE_DELAY_MS = 450;

function getTrackFromPost(post) {
  const raw = post?.Tracks ?? post?.tracks;
  if (raw == null) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

function getPlaybackWindow(post) {
  const track = getTrackFromPost(post);
  const durationMs = Number(track?.duration_ms);
  const hasStart = post?.preview_start_ms != null;
  const hasEnd = post?.preview_end_ms != null;
  const startMs = hasStart ? Math.max(0, Number(post.preview_start_ms) || 0) : 0;
  const rawEndMs = Number(post?.preview_end_ms);
  const fallbackEnd = Number.isFinite(durationMs) && durationMs > startMs
    ? durationMs
    : startMs + DEFAULT_LOOP_MS;
  const endMs = hasEnd && Number.isFinite(rawEndMs) && rawEndMs > startMs
    ? rawEndMs
    : fallbackEnd;

  return {
    trackId: track?.track_id,
    startMs,
    endMs,
  };
}

function loadSpotifySdk() {
  if (window.Spotify?.Player) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SPOTIFY_SDK_SRC}"]`);
    window.onSpotifyWebPlaybackSDKReady = () => resolve();

    if (existing) {
      const timer = window.setInterval(() => {
        if (window.Spotify?.Player) {
          window.clearInterval(timer);
          resolve();
        }
      }, 100);
      return;
    }

    const script = document.createElement("script");
    script.src = SPOTIFY_SDK_SRC;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Spotify SDK"));
    document.body.appendChild(script);
  });
}

export function useSpotifyAutoPreview(activePost, spotifyToken, options = {}) {
  const playerRef = useRef(null);
  const loopTimerRef = useRef(null);
  const playTimeoutRef = useRef(null);
  const activatedDeviceRef = useRef(null);
  const abortControllerRef = useRef(null);
  const playbackRequestRef = useRef(0);
  const notifiedUnavailableRef = useRef("");
  const onUnavailableRef = useRef(options.onUnavailable);
  const warningKeyRef = useRef("");
  const [browserPlaybackActivated, setBrowserPlaybackActivated] = useState(false);
  const [deviceId, setDeviceId] = useState(null);

  useEffect(() => {
    onUnavailableRef.current = options.onUnavailable;
  }, [options.onUnavailable]);

  useEffect(() => {
    if (!spotifyToken || typeof window === "undefined") return undefined;

    let cancelled = false;

    void loadSpotifySdk()
      .then(() => {
        if (cancelled || playerRef.current) return;

        const player = new window.Spotify.Player({
          name: "SoundGraffiti Feed",
          getOAuthToken: (callback) => callback(spotifyToken),
          volume: 0.8,
        });

        player.addListener("ready", ({ device_id }) => {
          setDeviceId(device_id);
        });

        player.addListener("not_ready", ({ device_id }) => {
          setDeviceId((currentDeviceId) =>
            currentDeviceId === device_id ? null : currentDeviceId,
          );
        });

        player.addListener("initialization_error", ({ message }) => {
          console.warn("Spotify initialization error:", message);
        });
        player.addListener("authentication_error", ({ message }) => {
          console.warn("Spotify authentication error:", message);
        });
        player.addListener("account_error", ({ message }) => {
          console.warn("Spotify account error:", message);
        });
        player.addListener("playback_error", ({ message }) => {
          console.warn("Spotify playback error:", message);
        });

        player.connect();
        playerRef.current = player;
      })
      .catch((error) => {
        console.warn(error);
      });

    return () => {
      cancelled = true;
    };
  }, [spotifyToken]);

  useEffect(() => {
    if (!spotifyToken || browserPlaybackActivated) return undefined;

    const activatePlayback = () => {
      const player = playerRef.current;
      if (!player) return;

      player.activateElement?.();
      setBrowserPlaybackActivated(true);
    };

    window.addEventListener("pointerdown", activatePlayback, { once: true });
    window.addEventListener("keydown", activatePlayback, { once: true });
    window.addEventListener("touchstart", activatePlayback, {
      once: true,
      passive: true,
    });

    return () => {
      window.removeEventListener("pointerdown", activatePlayback);
      window.removeEventListener("keydown", activatePlayback);
      window.removeEventListener("touchstart", activatePlayback);
    };
  }, [browserPlaybackActivated, spotifyToken]);

  useEffect(() => {
    const player = playerRef.current;
    const { trackId, startMs, endMs } = getPlaybackWindow(activePost);
    const requestId = playbackRequestRef.current + 1;
    playbackRequestRef.current = requestId;
    notifiedUnavailableRef.current = "";

    if (loopTimerRef.current) {
      window.clearInterval(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (playTimeoutRef.current) {
      window.clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    abortControllerRef.current?.abort();

    if (
      !spotifyToken ||
      !deviceId ||
      !player ||
      !trackId ||
      !browserPlaybackActivated ||
      document.hidden
    ) {
      return undefined;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const warnOnce = (key, ...args) => {
      if (warningKeyRef.current === key) return;
      warningKeyRef.current = key;
      console.warn(...args);
    };

    const notifyUnavailable = (reason) => {
      const key = `${activePost?.post_id ?? "post"}-${trackId}-${reason}`;
      if (notifiedUnavailableRef.current === key) return;
      notifiedUnavailableRef.current = key;
      onUnavailableRef.current?.({
        reason,
        track: getTrackFromPost(activePost),
      });
    };

    const verifyTrackPlayable = async () => {
      const response = await fetch(
        `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}?market=from_token`,
        {
          headers: {
            Authorization: `Bearer ${spotifyToken}`,
          },
          signal: abortController.signal,
        },
      );

      if (response.status === 403) {
        notifyUnavailable("forbidden");
        return false;
      }

      if (!response.ok) {
        warnOnce(
          `track-check-${trackId}-${response.status}`,
          "Spotify track playable check failed:",
          response.status,
        );
        return true;
      }

      const data = await response.json();
      if (data?.is_playable === false) {
        notifyUnavailable("not_playable");
        return false;
      }

      return true;
    };

    const transferPlayback = async () => {
      if (activatedDeviceRef.current === deviceId) return true;

      const response = await fetch("https://api.spotify.com/v1/me/player", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${spotifyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device_ids: [deviceId],
          play: false,
        }),
        signal: abortController.signal,
      });

      if (response.ok || response.status === 204) {
        activatedDeviceRef.current = deviceId;
        return true;
      }

      warnOnce(
        `transfer-${response.status}`,
        "Spotify device transfer failed:",
        response.status,
      );
      return false;
    };

    const playTrack = async () => {
      if (playbackRequestRef.current !== requestId) return;

      const playable = await verifyTrackPlayable();
      if (!playable || playbackRequestRef.current !== requestId) return;

      const transferred = await transferPlayback();
      if (!transferred) return;
      if (playbackRequestRef.current !== requestId) return;

      const response = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${spotifyToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            uris: [`spotify:track:${trackId}`],
            position_ms: startMs,
          }),
          signal: abortController.signal,
        },
      );

      if (response.status === 404) {
        activatedDeviceRef.current = null;
        const retried = await transferPlayback();
        if (!retried) return;

        const retryResponse = await fetch(
          `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${spotifyToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              uris: [`spotify:track:${trackId}`],
              position_ms: startMs,
            }),
            signal: abortController.signal,
          },
        );

        if (!retryResponse.ok && retryResponse.status !== 204) {
          if (retryResponse.status === 403) {
            notifyUnavailable("forbidden");
            return;
          }
          warnOnce(
            `play-${trackId}-${retryResponse.status}`,
            "Spotify play failed:",
            retryResponse.status,
          );
        }
        return;
      }

      if (!response.ok && response.status !== 204) {
        if (response.status === 403) {
          notifyUnavailable("forbidden");
          return;
        }
        warnOnce(
          `play-${trackId}-${response.status}`,
          "Spotify play failed:",
          response.status,
        );
        return;
      }

      if (playbackRequestRef.current !== requestId) return;

      loopTimerRef.current = window.setInterval(async () => {
        const state = await player.getCurrentState();
        if (!state || playbackRequestRef.current !== requestId) return;

        if (state.paused) {
          await player.resume();
        }

        if (state.position >= endMs - 250) {
          await player.seek(startMs);
        }
      }, 500);
    };

    playTimeoutRef.current = window.setTimeout(() => {
      void playTrack().catch((error) => {
        if (error?.name === "AbortError") return;
        warnOnce("play-exception", "Spotify play failed:", error);
      });
    }, DEVICE_SETTLE_DELAY_MS);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        abortController.abort();
        if (loopTimerRef.current) {
          window.clearInterval(loopTimerRef.current);
          loopTimerRef.current = null;
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      abortController.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (loopTimerRef.current) {
        window.clearInterval(loopTimerRef.current);
        loopTimerRef.current = null;
      }
      if (playTimeoutRef.current) {
        window.clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = null;
      }
    };
  }, [activePost, browserPlaybackActivated, deviceId, spotifyToken]);

  useEffect(() => {
    return () => {
      if (loopTimerRef.current) {
        window.clearInterval(loopTimerRef.current);
      }
      if (playTimeoutRef.current) {
        window.clearTimeout(playTimeoutRef.current);
      }
      abortControllerRef.current?.abort();
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, []);
}
