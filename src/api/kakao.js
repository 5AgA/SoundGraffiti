const KAKAO_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY

export const searchPlaces = async (query) => {
  const response = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`,
    {
      headers: {
        'Authorization': `KakaoAK ${KAKAO_API_KEY}`
      }
    }
  )
  const data = await response.json()
  console.log('카카오 응답:', data)  // 추가
  return data.documents
}