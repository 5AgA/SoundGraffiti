import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, prefer, baggage, sentry-trace',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { commentId, userId } = await req.json()

    if (!commentId || userId == null || userId === '') {
      return json({ error: '필수값 누락' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const actorId = Number(userId)

    const { data: comment, error: commentError } = await supabase
      .from('Comments')
      .select('comment_id, user_id, comment_deleted')
      .eq('comment_id', commentId)
      .single()

    if (commentError || !comment) {
      return json({ error: '댓글 없음' }, 404)
    }

    if (comment.comment_deleted) {
      return json({ error: '이미 삭제된 댓글' }, 400)
    }

    const ownerId = Number(comment.user_id)
    if (!Number.isFinite(actorId) || actorId !== ownerId) {
      return json({ error: '삭제 권한 없음' }, 403)
    }

    const { data, error } = await supabase
      .from('Comments')
      .update({
        content: '삭제된 댓글입니다.',
        comment_deleted: new Date(),
      })
      .eq('comment_id', commentId)
      .select()
      .single()

    if (error) {
      return json({ error: error.message }, 400)
    }

    return json(data, 200)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, 500)
  }
})
