import { describe, expect, it } from 'vitest'
import {
  isPublishableAttribute,
  publishableAttributes,
  resolveAttributeStatus,
} from '../attribute-evidence'
import type { ListingAttribute } from '../generator'
import type { DataStatus } from '../truth'

type EvidenceAttribute = ListingAttribute & {
  status?: DataStatus
  evidence?: string
  source_url?: string
}

function attribute(
  status?: DataStatus,
  source: ListingAttribute['source'] = 'ai',
  evidence?: string
): EvidenceAttribute {
  return {
    id: 'VOLTAGE',
    name: 'Voltagem',
    value_name: '220 V',
    tier: 'required',
    source,
    status,
    evidence,
  }
}

describe('attribute evidence publication contract', () => {
  it.each(['NEEDS_CONFIRMATION', 'CONFLICT', 'UNKNOWN', 'NOT_APPLICABLE'] as const)(
    'does not publish a %s value',
    status => {
      expect(isPublishableAttribute(attribute(status))).toBe(false)
      expect(publishableAttributes([attribute(status)])).toEqual([])
    }
  )

  it.each(['CONFIRMED', 'USER_OVERRIDE'] as const)(
    'publishes a non-empty %s value',
    status => {
      expect(isPublishableAttribute(attribute(status))).toBe(true)
    }
  )

  it('publishes AUTO_FILLED only when evidence was retained', () => {
    expect(isPublishableAttribute(attribute('AUTO_FILLED', 'catalog'))).toBe(false)
    expect(isPublishableAttribute(attribute('AUTO_FILLED', 'catalog', 'Catálogo exato MLB123'))).toBe(true)
  })

  it('keeps legacy AI and truth values non-publishable by default', () => {
    expect(resolveAttributeStatus(attribute(undefined, 'ai'))).toBe('NEEDS_CONFIRMATION')
    expect(resolveAttributeStatus(attribute(undefined, 'truth'))).toBe('NEEDS_CONFIRMATION')
  })

  it('recognizes legacy seller values as explicit overrides', () => {
    expect(resolveAttributeStatus(attribute(undefined, 'user'))).toBe('USER_OVERRIDE')
  })
})
