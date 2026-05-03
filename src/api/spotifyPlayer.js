export const TEST_TRACK_URI = 'spotify:track:11dFghVXANMlKmJXsNCbNl'

const SPOTIFY_PLAYER_API_URL = 'https://api.spotify.com/v1/me/player'

const getErrorMessage = async (response) => {
  try {
    const body = await response.json()
    return body?.error?.message ?? response.statusText
  } catch {
    return response.statusText
  }
}

export const playTrack = async ({ token, deviceId, trackUri = TEST_TRACK_URI }) => {
  if (!token) {
    throw new Error('Spotify access token is missing.')
  }

  if (!deviceId) {
    throw new Error('Spotify playback device is not ready yet.')
  }

  const response = await fetch(
    `${SPOTIFY_PLAYER_API_URL}/play?device_id=${encodeURIComponent(deviceId)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uris: [trackUri],
        position_ms: 0,
      }),
    }
  )

  if (response.status === 204) {
    return
  }

  const message = await getErrorMessage(response)
  throw new Error(`Spotify playback failed (${response.status}): ${message}`)
}
