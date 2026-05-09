import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { trackId, trackTitle, artistName, albumName, albumImageUrl, durationMs, previewUrl } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Tracks 테이블에 노래 저장 (이미 있으면 무시하는 Upsert)
    const { error: trackError } = await supabase
      .from('Tracks') 
      .upsert({
        track_id: trackId,
        track_title: trackTitle,
        artist_name: artistName,
        album_name: albumName,
        album_image_url: albumImageUrl,
        duration_ms: durationMs,
        preview_url: previewUrl,
        cached_at: new Date()
      }, { onConflict: 'track_id' })

    if (trackError) throw trackError

    // 성공하면 프론트엔드로 ok 사인 보냄!
    return new Response(JSON.stringify({ success: true, message: "노래 저장 완료" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    console.log('예외 발생:', e.message)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})