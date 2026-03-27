import { supabase } from '../supabaseClient'

export const uploadMedia = async (file, postId) => {
  const fileExt = file.name.split('.').pop()
  const filePath = `${postId}/${Date.now()}.${fileExt}`

  const { data, error } = await supabase.storage
    .from('post-media')
    .upload(filePath, file)

  if (error) {
    console.error(error)
    return null
  }

  // 공개 URL 가져오기
  const { data: urlData } = supabase.storage
    .from('post-media')
    .getPublicUrl(filePath)

  return urlData.publicUrl
}

export const saveMedia = async (postId, mediaUrl, displayOrder) => {
  const { data, error } = await supabase
    .from('PostMedia')
    .insert({
      post_id: postId,
      media_url: mediaUrl,
      display_order: displayOrder,
      media_created: new Date()
    })

  if (error) console.error(error)
  return data
}