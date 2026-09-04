-- Add the member-facing watch URL (embed link) for active lives.
-- Separate from live_credentials (streamer ingest RTMP URL/stream key),
-- which remain admin-only and are never exposed to members.
ALTER TABLE public.lives
ADD COLUMN IF NOT EXISTS watch_url TEXT NOT NULL DEFAULT '';
