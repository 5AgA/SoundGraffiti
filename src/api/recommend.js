import { supabase } from '../supabaseClient'

export const recommendTracks = async ({ placeName, content, visitReason }) => {
  const { data, error } = await supabase.functions.invoke('recommend-track', {
    body: { placeName, content, visitReason }
  })

  if (error) console.error(error)
  return data
}