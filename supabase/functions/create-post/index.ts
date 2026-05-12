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
    console.log('받은 데이터:', JSON.stringify(body)) 

    const { userId, trackId, placeId, content, previewStartMs, previewEndMs } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data, error } = await supabase
      .from('Posts')
      .insert({
        user_id: userId,
        track_id: trackId,
        place_id: placeId,
        content: content,
        preview_start_ms: previewStartMs, 
        preview_end_ms: previewEndMs,
        status: 'published',
        post_created: new Date()
      })
      .select()
      .single()

    if (error) {
      console.log('DB 에러:', JSON.stringify(error))  // 추가
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    console.log('예외 발생:', e.message)  // 추가
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})