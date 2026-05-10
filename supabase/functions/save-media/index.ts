import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const body = await req.json();
    const { postId, mediaUrl } = body;
    if (!postId || !mediaUrl) {
      throw new Error("postId와 mediaUrl이 필요합니다.");
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    // PostMedia 테이블에 사진 URL 저장!
    const { error: mediaError } = await supabase.from('PostMedia').insert({
      post_id: postId,
      media_url: mediaUrl,
      display_order: 1,
      media_created: new Date()
    });
    if (mediaError) throw mediaError;
    return new Response(JSON.stringify({
      success: true,
      message: "사진 저장 완료"
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    console.log('예외 발생:', e.message);
    return new Response(JSON.stringify({
      error: e.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
