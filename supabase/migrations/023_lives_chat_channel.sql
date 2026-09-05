-- Dedicated chat channel for the Lives screen (reuses the existing chat
-- system unchanged; this is purely additive seed data, on conflict no-op).

INSERT INTO public.chat_channels (name, description, slug, icon)
VALUES ('Ao Vivo', 'Converse durante as lives', 'ao-vivo', 'video')
ON CONFLICT (slug) DO NOTHING;
