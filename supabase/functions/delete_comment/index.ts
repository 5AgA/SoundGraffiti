import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { commentId, userId } = await req.json()

    if (!commentId || !userId) {
      return new Response(JSON.stringify({ error: '필수값 누락' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. 댓글 조회
    const { data: comment, error: commentError } = await supabase
      .from('Comments')
      .select('comment_id, user_id, comment_deleted')
      .eq('comment_id', commentId)
      .single()

    if (commentError || !comment) {
      return new Response(JSON.stringify({ error: '댓글 없음' }), {
        status: 404,
        headers: corsHeaders,
      })
    }

    // 2. 이미 삭제된 경우
    if (comment.comment_deleted) {
      return new Response(JSON.stringify({ error: '이미 삭제된 댓글' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // 3. 작성자 검증
    if (comment.user_id !== userId) {
      return new Response(JSON.stringify({ error: '삭제 권한 없음' }), {
        status: 403,
        headers: corsHeaders,
      })
    }

    // 4. soft delete
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
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    return new Response(JSON.stringify(data), {
      headers: corsHeaders,
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})