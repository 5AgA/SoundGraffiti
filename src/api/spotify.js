import { supabase } from '../supabaseClient'

export const searchTracks = async (query) => {
  const { data, error } = await supabase.functions.invoke('spotify-search', {
    body: { query }
  })

  if (error) console.error(error)
  return data
}