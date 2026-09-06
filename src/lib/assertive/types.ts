export interface ProductIdentification {
  name: string
  brand?: string
  model?: string
  category?: string
  category_id?: string
  specs: Record<string, string>
  confidence: number
}

export interface CompetitorData {
  item_id: string
  title: string
  price: number
  condition: 'new' | 'used'
  seller: {
    id: string
    nickname: string
    reputation: number
    level: string
  }
  pictures: string[]
  attributes: Record<string, string>
  shipping: { free_shipping: boolean }
  reviews_count: number
  listing_type: string
}

export interface Analysis {
  id: string
  user_id: string
  product_name: string
  category_id?: string
  input_type: 'photo' | 'description' | 'url'
  input_data: { image_url?: string; description?: string; ml_url?: string }
  identified_data?: ProductIdentification
  competitors?: CompetitorData[]
  status: 'pending' | 'analyzing' | 'ready' | 'error'
  created_at: string
  updated_at: string
}

export interface Listing {
  id: string
  analysis_id: string
  user_id: string
  variation_index: number
  title: string
  description: string
  price: number
  attributes: Record<string, unknown>
  photos: string[]
  status: 'draft' | 'ready' | 'publishing' | 'published' | 'error'
  ml_item_id?: string
  published_at?: string
  created_at: string
  updated_at: string
}

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

export interface GenerateListingInput {
  analysis: Analysis
  competitor_data: CompetitorData[]
  config: AIConfig
  variation_index: number
}

export interface GenerateListingOutput {
  title: string
  description: string
  price: number
  attributes: Record<string, unknown>
  category_id: string
}

export interface SpyResult {
  competitors: CompetitorData[]
  summary: {
    avg_price: number
    min_price: number
    max_price: number
    avg_reviews: number
    free_shipping_pct: number
    competition_level: 'baixa' | 'media' | 'alta'
    opportunity_score: number
  }
  recommendation: string
}
