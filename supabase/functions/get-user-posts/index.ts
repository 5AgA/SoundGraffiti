import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let userId: number
  try {
    const body = await req.json()
    userId = Number(body?.userId)
    if (!Number.isFinite(userId)) {
      throw new Error('invalid userId')
    }
  } catch {
    return new Response(JSON.stringify({ error: 'userId가 필요합니다.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await supabase
    .from('Posts')
    .select(`
      post_id,
      user_id,
      content,
      post_created,
      Places (place_name),
      Tracks (track_title, artist_name, album_image_url, preview_url, duration_ms),
      PostMedia (media_url, display_order),
      Likes (like_id, user_id, Users (user_name, user_profile_url)),
      Comments (
        comment_id,
        user_id,
        comment_deleted,
        content,
        comment_created,
        parent_comment_id,
        Users (user_id, user_name, user_profile_url)
      )
    `)
    .eq('user_id', userId)
    .is('post_deleted', null)
    .in('status', ['published', 'draft'])
    .order('post_created', { ascending: false })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(data ?? []), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
