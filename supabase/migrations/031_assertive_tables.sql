-- Assertive E-commerce IA tables

CREATE TABLE IF NOT EXISTS assertive_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  product_name TEXT NOT NULL,
  category_id TEXT,
  input_type TEXT CHECK (input_type IN ('photo', 'description', 'url')),
  input_data JSONB DEFAULT '{}',
  identified_data JSONB DEFAULT '{}',
  competitors JSONB DEFAULT '[]',
  status TEXT CHECK (status IN ('pending', 'analyzing', 'ready', 'error')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES assertive_analyses(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  variation_index INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10,2),
  attributes JSONB DEFAULT '{}',
  photos JSONB DEFAULT '[]',
  status TEXT CHECK (status IN ('draft', 'ready', 'publishing', 'published', 'error')) DEFAULT 'draft',
  ml_item_id TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  listing_id UUID REFERENCES assertive_listings(id),
  competitor_item_id TEXT NOT NULL,
  competitor_data JSONB DEFAULT '{}',
  change_type TEXT,
  old_value TEXT,
  new_value TEXT,
  detected_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_ml_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ml_user_id TEXT NOT NULL,
  nickname TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_erp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  provider TEXT CHECK (provider IN ('bling', 'olist', 'upseller')) NOT NULL,
  credentials JSONB NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'groq',
  api_key TEXT,
  base_url TEXT,
  model TEXT,
  default_variations INT DEFAULT 3,
  default_tone TEXT DEFAULT 'profissional',
  default_margin DECIMAL(5,2) DEFAULT 30.00,
  auto_publish BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_qa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  listing_id UUID REFERENCES assertive_listings(id),
  ml_question_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  status TEXT CHECK (status IN ('pending', 'answered', 'skipped')) DEFAULT 'pending',
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE assertive_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_ml_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_erp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_qa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own analyses" ON assertive_analyses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own listings" ON assertive_listings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own monitoring" ON assertive_monitoring FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own ml_connections" ON assertive_ml_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own erp_connections" ON assertive_erp_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own ai_config" ON assertive_ai_config FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own qa" ON assertive_qa FOR ALL USING (auth.uid() = user_id);
