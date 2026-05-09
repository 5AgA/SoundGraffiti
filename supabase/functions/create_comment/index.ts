import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { postId, userId, content, parentCommentId } = await req.json()

    if (!postId || !userId || !content) {
      return new Response(JSON.stringify({ error: '필수값 누락' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. parent_comment 검증 (대댓글일 경우)
    if (parentCommentId) {
      const { data: parent, error } = await supabase
        .from('Comments')
        .select('comment_id, post_id, comment_deleted')
        .eq('comment_id', parentCommentId)
        .single()

      if (error || !parent) {
        return new Response(JSON.stringify({ error: '부모 댓글 없음' }), {
          status: 400,
          headers: corsHeaders,
        })
      }
      
      if (parent.comment_deleted) {
        return new Response(JSON.stringify({
          error: '삭제된 댓글에는 답글을 작성할 수 없습니다.'
        }), {
          status: 400,
          headers: corsHeaders,
        })
      }
      
      if (parent.post_id !== postId) {
        return new Response(JSON.stringify({ error: '잘못된 대댓글 구조' }), {
          status: 400,
          headers: corsHeaders,
        })
      }
    }

    // 2. 댓글 생성
    const { data, error } = await supabase
      .from('Comments')
      .insert({
        post_id: postId,
        user_id: userId,
        content: content,
        parent_comment_id: parentCommentId ?? null,
      })
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