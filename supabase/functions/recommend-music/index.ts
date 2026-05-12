import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userInput } = await req.json();
    if (!userInput) throw new Error("userInput(감정 텍스트)이 전달되지 않았습니다.");

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID');
    const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET');

    // 💡 키가 하나라도 없으면 여기서 바로 에러를 뱉음!
    if (!GEMINI_API_KEY) throw new Error("제미나이 API 키가 서버에 등록되지 않았습니다.");
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) throw new Error("스포티파이 API 키가 등록되지 않았습니다.");

    const systemInstruction = `
# 페르소나
너는 위치 기반 음악 공유 서비스 '사운드 그래피티'의 AI 큐레이터 '그래피(Graffi)'야. 
사용자의 감정적인 글을 분석해 가장 어울리는 음악을 추천해 주는 전문가야. 

# 추천 규칙
1. 추천 이유는 20대 감성에 맞게 짧고 감성적인 문체로 작성하지만, 글의 내용을 분석하지말고 음악을 추천한 이유를 존댓말로 작성해.
2. 실제 존재하는 Spotify 곡 위주로 추천해.
3. 한국어와 영어 노래를 적절히 섞어서 추천해.
4. 20대들은 너무 유명한 노래만 나오면 금방 질려해. 음악 디깅의 재미를 느낄 수 있게 잘 알려지지 않은 명곡(숨은 띵곡)도 반드시 포함해.
5. 무조건 7곡 이상 추천해주고, 추천할만한 노래가 많으면 10개 이상으로도 추천해.
>>>>>>> ef48364 (fix: create-post)

# 출력 형식
반드시 순수한 JSON 형식으로만 답해줘.
{
  "analysis": "사용자의 감정 분석 한줄 요약",
  "recommendations": [
    { "title": "곡 제목", "artist": "아티스트", "reason": "추천 이유" }
  ]
}
    `;

    const prompt = `사용자의 글: "${userInput}"\n\n이 글의 분위기에 딱 어울리는 음악들을 추천해줘.`;

    // ==========================================
    // 💡 1. SDK 없이 제미나이 3.0 API 직통 호출! (안정성 최상)
    // ==========================================
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;
    
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`제미나이 오류: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    if (!geminiData.candidates || geminiData.candidates.length === 0) {
        throw new Error("제미나이가 응답을 주지 않았습니다.");
    }
    
    const responseText = geminiData.candidates[0].content.parts[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonContent = jsonMatch ? jsonMatch[0] : responseText;
    const aiData = JSON.parse(jsonContent);

    if (!aiData.recommendations) throw new Error("제미나이가 추천 목록 형식을 틀렸습니다.");

    // ==========================================
    // 💡 2. 스포티파이 연동
    // ==========================================
    const tokenUrl = "https://accounts.spotify.com/api/token";
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET)
      },
      body: 'grant_type=client_credentials'
    });
    
    if (!tokenResponse.ok) throw new Error("스포티파이 토큰 발급 실패");
    const tokenData = await tokenResponse.json();

    const realSpotifyTracks = [];
    
    for (const rec of aiData.recommendations) {
      const searchQuery = encodeURIComponent(`${rec.title} ${rec.artist}`);
      const searchUrl = `https://api.spotify.com/v1/search?q=${searchQuery}&type=track&limit=1`;
      
      const searchRes = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.tracks && searchData.tracks.items.length > 0) {
          realSpotifyTracks.push(searchData.tracks.items[0]);
        }
      }
    }

    // 최종 반환
    return new Response(JSON.stringify({
      analysis: aiData.analysis,
      recommendations: realSpotifyTracks 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('에러 발생:', error.message);
    // 💡 3. 에러가 나면 숨기지 않고 프론트엔드로 에러 사유를 그대로 쏴줌!
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});