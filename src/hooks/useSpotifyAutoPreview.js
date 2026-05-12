import { useEffect, useRef, useState } from "react";

const SPOTIFY_SDK_SRC = "https://sdk.scdn.co/spotify-player.js";
const DEFAULT_LOOP_MS = 30000;
const DEVICE_SETTLE_DELAY_MS = 900;
const DEVICE_READY_RETRY_DELAYS_MS = [0, 650, 1400, 2400];
const DEVICE_TRANSFER_RETRY_DELAYS_MS = [0, 800, 1600];

function getTrackFromPost(post) {
  const raw = post?.Tracks ?? post?.tracks;
  if (raw == null) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

function getPlaybackWindow(post) {
  const track = getTrackFromPost(post);
  const durationMs = Number(track?.duration_ms);
  const hasValidDuration = Number.isFinite(durationMs) && durationMs > 0;
  const rawStartMs = Number(post?.preview_start_ms);
  const rawEndMs = Number(post?.preview_end_ms);
  const hasCustomWindow =
    post?.preview_start_ms != null &&
    post?.preview_end_ms != null &&
    Number.isFinite(rawStartMs) &&
    Number.isFinite(rawEndMs) &&
    rawStartMs >= 0 &&
    rawEndMs > rawStartMs &&
    (!hasValidDuration || rawStartMs < durationMs);
  const startMs = hasCustomWindow ? rawStartMs : 0;
  const fallbackEnd = hasValidDuration
    ? durationMs
    : startMs + DEFAULT_LOOP_MS;
  const endMs = hasCustomWindow
    ? Math.min(rawEndMs, fallbackEnd)
    : fallbackEnd;

  return {
    trackId: track?.track_id,
    startMs,
    endMs,
    usesCustomWindow: hasCustomWindow,
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

function wait(ms, signal) {
  if (ms <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const handleAbort = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

export function useSpotifyAutoPreview(activePost, spotifyToken, options = {}) {
  const playerRef = useRef(null);
  const loopTimerRef = useRef(null);
  const playTimeoutRef = useRef(null);
  const activatedDeviceRef = useRef(null);
  const abortControllerRef = useRef(null);
  const playbackRequestRef = useRef(0);
  const userInteractedRef = useRef(false);
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
    window.queueMicrotask(() => {
      if (!cancelled) setDeviceId(null);
    });
    activatedDeviceRef.current = null;
    playerRef.current?.disconnect();
    playerRef.current = null;

    void loadSpotifySdk()
      .then(() => {
        if (cancelled) return;

        const player = new window.Spotify.Player({
          name: "SoundGraffiti Feed",
          getOAuthToken: (callback) => callback(spotifyToken),
          volume: 0.8,
        });

        player.addListener("ready", ({ device_id }) => {
          if (cancelled) return;
          setDeviceId(device_id);
          if (userInteractedRef.current) {
            player.activateElement?.();
            setBrowserPlaybackActivated(true);
          }
        });

        player.addListener("not_ready", ({ device_id }) => {
          if (cancelled) return;
          setDeviceId((currentDeviceId) =>
            currentDeviceId === device_id ? null : currentDeviceId,
          );
        });

        player.addListener("initialization_error", ({ message }) => {
          console.warn("Spotify initialization error:", message);
        });
        player.addListener("authentication_error", ({ message }) => {
          console.warn("Spotify authentication error:", message);
          onUnavailableRef.current?.({ reason: "token_expired" });
        });
        player.addListener("account_error", ({ message }) => {
          console.warn("Spotify account error:", message);
          onUnavailableRef.current?.({ reason: "premium_required" });
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
      playerRef.current?.disconnect();
      playerRef.current = null;
      activatedDeviceRef.current = null;
    };
  }, [spotifyToken]);

  useEffect(() => {
    if (!spotifyToken || browserPlaybackActivated) return undefined;

    const activatePlayback = () => {
      userInteractedRef.current = true;
      const player = playerRef.current;
      if (!player) return;

      player.activateElement?.();
      setBrowserPlaybackActivated(true);
    };

    window.addEventListener("pointerdown", activatePlayback);
    window.addEventListener("keydown", activatePlayback);
    window.addEventListener("touchstart", activatePlayback, {
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
    const { trackId, startMs, endMs, usesCustomWindow } =
      getPlaybackWindow(activePost);
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

      if (response.status === 401) {
        notifyUnavailable("token_expired");
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

    const isDeviceAvailable = async () => {
      const response = await fetch("https://api.spotify.com/v1/me/player/devices", {
        headers: {
          Authorization: `Bearer ${spotifyToken}`,
        },
        signal: abortController.signal,
      });

      if (response.status === 401) {
        notifyUnavailable("token_expired");
        return false;
      }

      if (response.status === 403) {
        notifyUnavailable("premium_required");
        return false;
      }

      if (!response.ok) {
        warnOnce(
          `devices-${response.status}`,
          "Spotify device lookup failed:",
          response.status,
        );
        return true;
      }

      const data = await response.json();
      return Array.isArray(data?.devices)
        ? data.devices.some((device) => device?.id === deviceId)
        : false;
    };

    const waitForDevice = async () => {
      for (const delayMs of DEVICE_READY_RETRY_DELAYS_MS) {
        await wait(delayMs, abortController.signal);
        if (playbackRequestRef.current !== requestId) return false;
        if (await isDeviceAvailable()) return true;
      }

      notifyUnavailable("device_unavailable");
      warnOnce(
        `device-not-ready-${deviceId}`,
        "Spotify device was not available for transfer:",
        deviceId,
      );
      return false;
    };

    const transferPlayback = async () => {
      if (activatedDeviceRef.current === deviceId) return true;
      if (!(await waitForDevice())) return false;

      for (const delayMs of DEVICE_TRANSFER_RETRY_DELAYS_MS) {
        await wait(delayMs, abortController.signal);
        if (playbackRequestRef.current !== requestId) return false;

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

        activatedDeviceRef.current = null;

        if (response.status === 401) {
          notifyUnavailable("token_expired");
          return false;
        }

        if (response.status === 403) {
          notifyUnavailable("premium_required");
          return false;
        }

        if (response.status !== 404) {
          warnOnce(
            `transfer-${response.status}`,
            "Spotify device transfer failed:",
            response.status,
          );
          return false;
        }
      }

      warnOnce(
        `transfer-404-${deviceId}`,
        "Spotify device transfer failed:",
        404,
      );
      notifyUnavailable("device_unavailable");
      return false;
    };

    const requestPlay = (positionMs) =>
      fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${spotifyToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            uris: [`spotify:track:${trackId}`],
            position_ms: positionMs,
          }),
          signal: abortController.signal,
        },
      );

    const playTrack = async () => {
      if (playbackRequestRef.current !== requestId) return;

      const playable = await verifyTrackPlayable();
      if (!playable || playbackRequestRef.current !== requestId) return;

      const transferred = await transferPlayback();
      if (!transferred) return;
      if (playbackRequestRef.current !== requestId) return;

      let response = await requestPlay(startMs);
      let playbackStartMs = startMs;
      let playbackEndMs = endMs;

      if (response.status === 403 && usesCustomWindow && startMs > 0) {
        response = await requestPlay(0);
        playbackStartMs = 0;
        playbackEndMs = Number.POSITIVE_INFINITY;
      }

      if (response.status === 404) {
        activatedDeviceRef.current = null;
        const retried = await transferPlayback();
        if (!retried) return;

        let retryResponse = await requestPlay(startMs);
        playbackStartMs = startMs;
        playbackEndMs = endMs;

        if (retryResponse.status === 403 && usesCustomWindow && startMs > 0) {
          retryResponse = await requestPlay(0);
          playbackStartMs = 0;
          playbackEndMs = Number.POSITIVE_INFINITY;
        }

        if (!retryResponse.ok && retryResponse.status !== 204) {
          if (retryResponse.status === 401) {
            notifyUnavailable("token_expired");
            return;
          }
          if (retryResponse.status === 403) {
            notifyUnavailable("premium_required");
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
        if (response.status === 401) {
          notifyUnavailable("token_expired");
          return;
        }
        if (response.status === 403) {
          notifyUnavailable("premium_required");
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

        if (state.position >= playbackEndMs - 250) {
          await player.seek(playbackStartMs);
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
