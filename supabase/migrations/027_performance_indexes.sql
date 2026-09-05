-- Performance indexes for scale
CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON public.community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON public.community_comments(post_id, created_at ASC);