import { useEffect, useRef, useState } from 'react'

const SPOTIFY_SDK_SCRIPT_ID = 'spotify-web-playback-sdk'
const SPOTIFY_SDK_SRC = 'https://sdk.scdn.co/spotify-player.js'

const loadSpotifySdk = () => {
  if (window.Spotify?.Player) {
    return Promise.resolve()
  }

  const existingScript = document.getElementById(SPOTIFY_SDK_SCRIPT_ID)

  if (existingScript) {
    return new Promise((resolve) => {
      window.onSpotifyWebPlaybackSDKReady = resolve
    })
  }

  return new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = resolve

    const script = document.createElement('script')
    script.id = SPOTIFY_SDK_SCRIPT_ID
    script.src = SPOTIFY_SDK_SRC
    script.async = true
    script.onerror = () => reject(new Error('Failed to load Spotify Web Playback SDK.'))

    document.body.appendChild(script)
  })
}

export const useSpotifyPlayer = (spotifyToken) => {
  const playerRef = useRef(null)
  const [deviceId, setDeviceId] = useState(null)
  const [playerState, setPlayerState] = useState(null)
  const [positionMs, setPositionMs] = useState(0)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    if (!spotifyToken) {
      return undefined
    }

    const setupPlayer = async () => {
      setStatus('loading')
      setError(null)

      try {
        await loadSpotifySdk()

        if (cancelled) return

        const player = new window.Spotify.Player({
          name: 'SoundGraffiti Test Player',
          getOAuthToken: (callback) => callback(spotifyToken),
          volume: 0.5,
          enableMediaSession: true,
        })

        playerRef.current = player

        player.addListener('ready', ({ device_id }) => {
          setDeviceId(device_id)
          setStatus('ready')
        })

        player.addListener('not_ready', () => {
          setDeviceId(null)
          setStatus('offline')
        })

        player.addListener('player_state_changed', (state) => {
          setPlayerState(state)
          setPositionMs(state?.position ?? 0)
        })

        player.addListener('initialization_error', ({ message }) => {
          setError(message)
          setStatus('error')
        })

        player.addListener('authentication_error', ({ message }) => {
          setError(message)
          setStatus('error')
        })

        player.addListener('account_error', ({ message }) => {
          setError(`${message} Spotify Premium account is required for playback.`)
          setStatus('error')
        })

        player.addListener('playback_error', ({ message }) => {
          setError(message)
          setStatus('error')
        })

        player.addListener('autoplay_failed', () => {
          setError('Autoplay was blocked. Click the play button again.')
        })

        const connected = await player.connect()

        if (!connected) {
          setError('Spotify player connection was rejected.')
          setStatus('error')
        }
      } catch (setupError) {
        if (!cancelled) {
          setError(setupError.message)
          setStatus('error')
        }
      }
    }

    setupPlayer()

    return () => {
      cancelled = true

      if (playerRef.current) {
        playerRef.current.disconnect()
        playerRef.current = null
      }
    }
  }, [spotifyToken])

  useEffect(() => {
    if (!playerState || playerState.paused) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setPositionMs((currentPosition) => {
        const duration = playerState.duration ?? currentPosition
        return Math.min(currentPosition + 1000, duration)
      })
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [playerState])

  const activatePlayer = () => {
    playerRef.current?.activateElement?.()
  }

  const pausePlayer = async () => {
    await playerRef.current?.pause()
  }

  const resumePlayer = async () => {
    await playerRef.current?.resume()
  }

  const seekTo = async (position) => {
    await playerRef.current?.seek(position)
    setPositionMs(position)
  }

  const stopPlayer = async () => {
    await playerRef.current?.pause()
    await seekTo(0)
  }

  return {
    activatePlayer,
    deviceId: spotifyToken ? deviceId : null,
    error: spotifyToken ? error : null,
    playerState: spotifyToken ? playerState : null,
    pausePlayer,
    positionMs: spotifyToken ? positionMs : 0,
    resumePlayer,
    seekTo,
    status: spotifyToken ? status : 'idle',
    stopPlayer,
  }
}
