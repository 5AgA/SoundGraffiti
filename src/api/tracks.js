import { supabase } from '../supabaseClient'

export const saveTrack = async (track) => {
  // 중복 확인
  const { data: existing } = await supabase
    .from('Tracks')
    .select('*')
    .eq('track_id', track.id)
    .single()

  if (existing) {
    console.log('이미 저장된 트랙이에요')
    return existing
  }

  // 없으면 저장
  const { data, error } = await supabase
    .from('Tracks')
    .insert({
      track_id: track.id,
      track_title: track.name,
      artist_name: track.artists[0].name,
      album_name: track.album.name,
      album_image_url: track.album.images[0]?.url,
      duration_ms: track.duration_ms,
      preview_url: track.preview_url,
      cached_at: new Date()
    })
    .select()
    .single()

  if (error) console.error(error)
  return data
}