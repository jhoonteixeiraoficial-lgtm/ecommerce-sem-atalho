import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Assertive input types migration', () => {
  it('usa uma versão exclusiva no histórico de migrations', () => {
    const migrations = readdirSync(resolve(process.cwd(), 'supabase/migrations'))
      .filter(file => file.endsWith('.sql'))
    const versions = migrations.map(file => file.split('_', 1)[0])
    const duplicates = versions.filter((version, index) => versions.indexOf(version) !== index)

    expect(duplicates).toEqual([])
  })

  it('aceita as seis modalidades e preserva o tipo photo legado', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260908120000_assertive_input_types.sql'),
      'utf8'
    )

    for (const inputType of [
      'single_image',
      'multi_image',
      'description',
      'url',
      'gtin',
      'brand_model',
      'photo',
    ]) {
      expect(sql).toContain(`'${inputType}'`)
    }

    expect(sql).toContain('DROP CONSTRAINT IF EXISTS assertive_analyses_input_type_check')
    expect(sql).toContain('ADD CONSTRAINT assertive_analyses_input_type_check')
  })

  it('cria ativos imutáveis, operações e posições únicas de imagens', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260909180000_assertive_image_assets.sql'),
      'utf8'
    )

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS assertive_image_assets')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS assertive_image_operations')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS assertive_listing_images')
    expect(sql).toContain('UNIQUE (listing_id, position)')
    expect(sql).toContain("'REFERENCE_ONLY'")
    expect(sql).toContain('CREATE OR REPLACE FUNCTION assertive_replace_listing_images')
    expect(sql).toContain('REVOKE ALL ON FUNCTION assertive_replace_listing_images')
  })

  it('preserva o rótulo de recortes seguros ao substituir a galeria', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260911235000_assertive_safe_crop_labels.sql'),
      'utf8'
    )

    expect(sql).toContain("asset.metadata ->> 'operation' = 'SAFE_CROP'")
    expect(sql).toContain("THEN 'Recorte da foto original'")
  })

  it('persiste escolhas seguras de anúncio e entrega', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260912001000_assertive_publication_options.sql'),
      'utf8'
    )

    expect(sql).toContain('shipping_mode TEXT NOT NULL DEFAULT \'me2\'')
    expect(sql).toContain("shipping_mode IN ('me2','me1','custom')")
    expect(sql).toContain('free_shipping BOOLEAN NOT NULL DEFAULT false')
    expect(sql).toContain('free_shipping_mandatory BOOLEAN NOT NULL DEFAULT false')
    expect(sql).toContain('NOT free_shipping_mandatory OR free_shipping')
  })
})
