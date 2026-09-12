ALTER TABLE public.assertive_listings
  ADD COLUMN IF NOT EXISTS shipping_mode TEXT NOT NULL DEFAULT 'me2',
  ADD COLUMN IF NOT EXISTS free_shipping BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_shipping_mandatory BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.assertive_listings
  DROP CONSTRAINT IF EXISTS assertive_listings_shipping_mode_check;

ALTER TABLE public.assertive_listings
  ADD CONSTRAINT assertive_listings_shipping_mode_check
  CHECK (shipping_mode IN ('me2','me1','custom'));

ALTER TABLE public.assertive_listings
  DROP CONSTRAINT IF EXISTS assertive_listings_free_shipping_policy_check;

ALTER TABLE public.assertive_listings
  ADD CONSTRAINT assertive_listings_free_shipping_policy_check
  CHECK (NOT free_shipping_mandatory OR free_shipping);
