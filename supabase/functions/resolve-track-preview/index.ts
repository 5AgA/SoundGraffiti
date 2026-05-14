import { resolveItunesPreview, type PreviewInput } from '../_shared/itunes_preview_match.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const input = await req.json().catch(() => ({})) as PreviewInput
    const match = await resolveItunesPreview(input)
    if (!match) {
      return jsonResponse({ previewUrl: '', reason: 'not_found' })
    }

    return jsonResponse({
      provider: 'itunes',
      previewUrl: match.previewUrl,
      trackId: match.trackId,
      trackName: match.trackName,
      artistName: match.artistName,
      artworkUrl: match.artworkUrl100,
      trackViewUrl: match.trackViewUrl,
      confidence: Number(match.confidence.toFixed(3)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error'
    return jsonResponse({ error: message }, 500)
  }
})
