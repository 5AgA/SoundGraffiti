import { supabase } from '../supabaseClient'

export const searchTracks = async (query, offset = 0) => {
  const { data, error } = await supabase.functions.invoke('spotify-search', {
    body: { query, offset }
  })

  if (error) console.error(error)
  return data
}