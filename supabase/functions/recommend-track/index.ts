const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { placeName, content, visitReason } = await req.json()

    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')

    const prompt = `
      나는 지금 "${placeName}"에 있어.
      방문 이유: "${visitReason}"
      현재 내 상태/기분: "${content}"

      이 상황에 어울리는 노래 5곡을 추천해줘.
      JSON 배열 형식으로만 답하고 다른 말은 절대 하지마.
      마크다운 코드블록도 쓰지마.

      [
        {
          "title": "노래 제목",
          "artist": "아티스트명",
          "reason": "이 노래를 추천하는 이유 (한 줄)"
        }
      ]
    `

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    })

    const data = await response.json()
    console.log('Groq 응답:', JSON.stringify(data))

    const text = data.choices[0].message.content
    const clean = text.replace(/```json|```/g, '').trim()
    const tracks = JSON.parse(clean)

    return new Response(JSON.stringify(tracks), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    console.log('에러:', e.message)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})