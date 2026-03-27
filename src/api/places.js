import { supabase } from '../supabaseClient'

export const savePlace = async (place) => {
  const { data: existing } = await supabase
    .from('Places')
    .select('place_id')
    .eq('external_place_id', place.id)
    .single()

  if (existing) {
    console.log('이미 저장된 장소예요')
    return existing
  }

  const { data, error } = await supabase
    .from('Places')
    .insert({
      place_name: place.place_name,
      address: place.road_address_name || place.address_name,
      latitude: parseFloat(place.y),
      longitude: parseFloat(place.x),
      external_place_id: place.id,
      place_created: new Date()
    })
    .select()
    .maybeSingle()

  if (error) console.error(error)
  return data
}