-- Accept the six current identification modes while preserving legacy rows.
ALTER TABLE public.assertive_analyses
  DROP CONSTRAINT IF EXISTS assertive_analyses_input_type_check;

ALTER TABLE public.assertive_analyses
  ADD CONSTRAINT assertive_analyses_input_type_check
  CHECK (input_type IN (
    'photo',
    'single_image',
    'multi_image',
    'description',
    'url',
    'gtin',
    'brand_model'
  ));
