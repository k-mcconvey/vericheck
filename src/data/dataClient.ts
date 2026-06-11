import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[dataClient] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Fill in .env.local and restart the dev server.',
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')

export async function pingSupabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('session_state').select('current_phase').limit(1)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function startParticipant(): Promise<
  { participant_code: string; order_seed: number } | { error: string }
> {
  try {
    const { data, error } = await supabase.functions.invoke('start-participant', {
      body: {
        instance_id: import.meta.env.VITE_INSTANCE_ID ?? 'test',
        population_label: import.meta.env.VITE_POPULATION_LABEL ?? '',
      },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data as { participant_code: string; order_seed: number }
  } catch (e) {
    return { error: String(e) }
  }
}

export async function submitConsent(
  participantCode: string,
  consentedResearch: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('submit-consent', {
      body: { participant_code: participantCode, consented_research: consentedResearch },
    })
    if (error) return { ok: false, error: error.message }
    if (data?.error) return { ok: false, error: data.error }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export interface DemographicsAnswers {
  role: string
  field_domain: string
  ai_familiarity: string
  legal_exposure: string
  prior_ai_research: string
}

export async function submitDemographics(
  participantCode: string,
  answers: DemographicsAnswers,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('submit-demographics', {
      body: { participant_code: participantCode, ...answers },
    })
    if (error) return { ok: false, error: error.message }
    if (data?.error) return { ok: false, error: data.error }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function setGroup(
  participantCode: string,
  group: 'A' | 'B' | 'C',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('set-group', {
      body: { participant_code: participantCode, group },
    })
    if (error) return { ok: false, error: error.message }
    if (data?.error) return { ok: false, error: data.error }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
