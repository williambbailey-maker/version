import { supabase } from './supabase'

/** Studio objects that open a tag. The user can point each at any tag. */
export type RoomObject = 'congas' | 'keyboard' | 'fx' | 'amp' | 'mic' | 'trombone'

export type RoomMap = Record<RoomObject, string>

export const DEFAULT_ROOM: RoomMap = { congas: 'percussion', keyboard: 'keys', fx: 'fx', amp: 'bass', mic: 'vocals', trombone: 'horns' }

export const ROOM_OBJECT_LABEL: Record<RoomObject, string> = {
  congas: 'Congas',
  keyboard: 'Keyboard',
  fx: 'FX pedal',
  amp: 'Amp',
  mic: 'Mic',
  trombone: 'Trombone',
}

export async function loadRoomMap(): Promise<RoomMap> {
  const { data, error } = await supabase.from('settings').select('room').maybeSingle()
  if (error) throw new Error(error.message)
  const room = (data?.room ?? {}) as Partial<Record<string, unknown>>
  const out = { ...DEFAULT_ROOM }
  for (const k of Object.keys(DEFAULT_ROOM) as RoomObject[]) {
    const v = room[k]
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().toLowerCase()
  }
  return out
}

export async function saveRoomMap(map: RoomMap): Promise<void> {
  const { error } = await supabase.from('settings').upsert({ room: map, updated_at: new Date().toISOString() }, { onConflict: 'owner' })
  if (error) throw new Error(error.message)
}
