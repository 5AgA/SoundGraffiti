import { useState } from 'react'
import { playTrack, TEST_TRACK_URI } from '../api/spotifyPlayer'
import { useAuth } from '../contexts/AuthContext'
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer'

const formatDuration = (milliseconds) => {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

export default function SpotifyTestPlayer() {
  const { spotifyToken, user } = useAuth()
  const {
    activatePlayer,
    deviceId,
    error: playerError,
    pausePlayer,
    playerState,
    positionMs,
    resumePlayer,
    seekTo,
    status,
    stopPlayer,
  } = useSpotifyPlayer(spotifyToken)
  const [playError, setPlayError] = useState(null)
  const [isStarting, setIsStarting] = useState(false)

  const currentTrack = playerState?.track_window?.current_track
  const durationMs = playerState?.duration ?? 0
  const isPaused = playerState?.paused ?? true
  const isReady = Boolean(spotifyToken && deviceId && status === 'ready')

  const handlePlayTestTrack = async () => {
    activatePlayer()
    setIsStarting(true)
    setPlayError(null)

    try {
      await playTrack({
        token: spotifyToken,
        deviceId,
        trackUri: TEST_TRACK_URI,
      })
    } catch (error) {
      setPlayError(error.message)
    } finally {
      setIsStarting(false)
    }
  }

  const handleResume = async () => {
    activatePlayer()
    setPlayError(null)

    try {
      await resumePlayer()
    } catch (error) {
      setPlayError(error.message)
    }
  }

  const handlePause = async () => {
    setPlayError(null)

    try {
      await pausePlayer()
    } catch (error) {
      setPlayError(error.message)
    }
  }

  const handleStop = async () => {
    setPlayError(null)

    try {
      await stopPlayer()
    } catch (error) {
      setPlayError(error.message)
    }
  }

  const handleSeek = async (event) => {
    setPlayError(null)

    try {
      await seekTo(Number(event.target.value))
    } catch (error) {
      setPlayError(error.message)
    }
  }

  return (
    <section style={{ padding: '16px', border: '1px solid #ddd', marginBottom: '16px' }}>
      <h2>Spotify Playback Test</h2>
      <p>Status: {spotifyToken ? status : 'login required'}</p>
      <p>Device: {deviceId ?? 'not ready'}</p>
      {currentTrack && (
        <p>
          Now playing: {currentTrack.name} - {currentTrack.artists?.map((artist) => artist.name).join(', ')}
        </p>
      )}
      {!user && <p>Spotify login is required before testing playback.</p>}
      {user && !spotifyToken && <p>Log in with Spotify again to receive a Spotify playback token.</p>}
      {playerError && <p style={{ color: 'crimson' }}>{playerError}</p>}
      {playError && <p style={{ color: 'crimson' }}>{playError}</p>}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={handlePlayTestTrack} disabled={!isReady || isStarting}>
          {isStarting ? 'Starting...' : 'Play sample track'}
        </button>
        <button onClick={isPaused ? handleResume : handlePause} disabled={!isReady || !currentTrack}>
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button onClick={handleStop} disabled={!isReady || !currentTrack}>
          Stop
        </button>
      </div>
      <div style={{ marginTop: '12px' }}>
        <input
          aria-label="Playback position"
          type="range"
          min="0"
          max={durationMs || 0}
          step="1000"
          value={Math.min(positionMs, durationMs || 0)}
          onChange={handleSeek}
          disabled={!isReady || !currentTrack}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span>{formatDuration(positionMs)}</span>
          <span>{formatDuration(durationMs)}</span>
        </div>
      </div>
    </section>
  )
}
