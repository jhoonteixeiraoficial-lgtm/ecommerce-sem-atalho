export interface AIConfig {
  id: string
  user_id: string
  provider: 'groq' | 'gemini' | 'claude' | 'openai' | 'custom'
  api_key?: string
  base_url?: string
  model?: string
  default_variations: number
  default_tone: string
  default_margin: number
  auto_publish: boolean
  created_at: string
  updated_at: string
}

export interface MLConnection {
  id: string
  user_id: string
  access_token: string
  refresh_token: string
  expires_at: string
  ml_user_id: string
  nickname?: string
}

export type ListingStatus =
  | 'draft'
  | 'needs_input'
  | 'ready'
  | 'validating'
  | 'ready_to_publish'
  | 'publishing'
  | 'published'
  | 'failed'
