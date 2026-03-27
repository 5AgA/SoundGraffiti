import { supabase } from '../supabaseClient'

export const createPost = async ({ userId, trackId, placeId, content }) => {
  const { data, error } = await supabase.functions.invoke('create-post', {
    body: { userId, trackId, placeId, content }
  })

  if (error) console.error(error)
  return data
}

export const updatePost = async ({ postId, content }) => {
  const { data, error } = await supabase.functions.invoke('update-post', {
    body: { postId, content }
  })

  if (error) console.error(error)
  return data
}

export const deletePost = async ({ postId }) => {
  const { data, error } = await supabase.functions.invoke('delete-post', {
    body: { postId }
  })

  if (error) console.error(error)
  return data
}

export const getFeed = async () => {
  const { data, error } = await supabase.functions.invoke('get-feed')

  if (error) console.error(error)
  return data
}