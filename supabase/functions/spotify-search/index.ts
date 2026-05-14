import { resolveItunesPreview, type PreviewInput } from '../_shared/itunes_preview_match.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type SpotifyArtist = { name?: string }
type SpotifyTrack = {
  name?: string
  artists?: SpotifyArtist[]
  album?: { name?: string }
  duration_ms?: number
}

function previewInputFromSpotify(track: SpotifyTrack): PreviewInput | null {
  const title = track.name?.trim()
  if (!title) return null
  const artistName = (track.artists ?? [])
    .map((a) => a?.name)
    .filter((n): n is string => Boolean(n && String(n).trim()))
    .join(', ')
  return {
    trackTitle: title,
    artistName: artistName || undefined,
    albumName: track.album?.name,
    durationMs: track.duration_ms,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { query, offset = 0 } = await req.json()

  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret),
    },
    body: 'grant_type=client_credentials',
  })
  const tokenData = await tokenResponse.json()

  const searchResponse = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10&offset=` + offset,
    {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    },
  )
  const searchData = await searchResponse.json()
  const items = (searchData?.tracks?.items ?? []) as SpotifyTrack[]

  const enriched = await Promise.all(
    items.map(async (track) => {
      const input = previewInputFromSpotify(track)
      if (!input) {
        return { ...track, itunes_preview_available: false }
      }
      try {
        const match = await resolveItunesPreview(input)
        return { ...track, itunes_preview_available: Boolean(match?.previewUrl) }
      } catch {
        return { ...track, itunes_preview_available: false }
      }
    }),
  )

  return new Response(JSON.stringify(enriched), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
