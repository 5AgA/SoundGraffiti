const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { placeName, content, visitReason } = await req.json()

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

  const prompt = `
    나는 지금 "${placeName}"에 있어.
    방문 이유: "${visitReason}"
    현재 내 상태/기분: "${content}"

    이 상황에 어울리는 노래 5곡을 추천해줘.
    각 노래마다 아래 형식으로 답해줘.
    JSON 배열 형식으로만 답하고 다른 말은 하지마.

    [
      {
        "title": "노래 제목",
        "artist": "아티스트명",
        "reason": "이 노래를 추천하는 이유 (한 줄)"
      }
    ]
  `

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  )

  const data = await response.json()
  const text = data.candidates[0].content.parts[0].text
  const clean = text.replace(/```json|```/g, '').trim()
  const tracks = JSON.parse(clean)

  return new Response(JSON.stringify(tracks), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})