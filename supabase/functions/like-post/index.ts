import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { postId, userId } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 이미 좋아요 했는지 확인
  const { data: existing } = await supabase
    .from('Likes')
    .select('like_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    // 좋아요 취소
    const { error } = await supabase
      .from('Likes')
      .delete()
      .eq('like_id', existing.like_id)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ liked: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } else {
    // 좋아요 추가
    const { error } = await supabase
      .from('Likes')
      .insert({
        post_id: postId,
        user_id: userId,
        liked_at: new Date()
      })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ liked: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})