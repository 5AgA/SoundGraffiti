import { supabase } from '../supabaseClient'

export const toggleLike = async (postId, userId) => {
  const { data, error } = await supabase.functions.invoke('like-post', {
    body: { postId, userId }
  })

  if (error) console.error(error)
  return data
}