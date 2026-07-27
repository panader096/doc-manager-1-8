// app/lib/settings.ts
import { createClient } from './supabase/client'

export interface UserSettings {
  chat_model: string
  harry_model: string
}

const SETTINGS_SELECT = 'chat_model, harry_model'

export async function getUserSettings(): Promise<UserSettings> {
  const supabase = createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('Not signed in')

  const { data: existing, error: fetchError } = await supabase
    .from('user_settings')
    .select(SETTINGS_SELECT)
    .eq('user_id', user.id)
    .maybeSingle()
  if (fetchError) throw fetchError
  if (existing) return existing

  const { data: created, error: insertError } = await supabase
    .from('user_settings')
    .insert({})
    .select(SETTINGS_SELECT)
    .single()
  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raced, error: racedError } = await supabase
        .from('user_settings')
        .select(SETTINGS_SELECT)
        .eq('user_id', user.id)
        .single()
      if (racedError) throw racedError
      return raced
    }
    throw insertError
  }
  return created
}

export async function updateChatModel(model: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('user_settings')
    .upsert({ chat_model: model, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
}

export async function updateHarryModel(model: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('user_settings')
    .upsert({ harry_model: model, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
}
