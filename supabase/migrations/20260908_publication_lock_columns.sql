-- Migration: Add publication lock columns to assertive_listings
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ifcmeziumkctejqbyxdo/sql

ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS publishing_started_at timestamptz;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS publishing_attempt_id text;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS last_publication_error text;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS validated_payload_hash text;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS validated_payload jsonb;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS published_payload jsonb;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS ml_response jsonb;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS publication_status text;
