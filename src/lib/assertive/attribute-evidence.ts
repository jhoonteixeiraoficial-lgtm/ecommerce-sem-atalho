import type { DataStatus } from './truth'

export interface EvidenceAttribute {
  value_name?: string
  source: 'truth' | 'ai' | 'catalog' | 'user'
  status?: DataStatus
  evidence?: string
  source_url?: string
}

export function resolveAttributeStatus(attribute: EvidenceAttribute): DataStatus {
  if (attribute.status) return attribute.status
  if (attribute.source === 'user') return 'USER_OVERRIDE'
  if (attribute.source === 'catalog' && attribute.evidence?.trim()) return 'AUTO_FILLED'
  return 'NEEDS_CONFIRMATION'
}

export function isPublishableAttribute(attribute: EvidenceAttribute): boolean {
  if (!attribute.value_name?.trim()) return false
  const status = resolveAttributeStatus(attribute)
  if (status === 'CONFIRMED' || status === 'USER_OVERRIDE') return true
  return status === 'AUTO_FILLED'
    && attribute.source !== 'ai'
    && Boolean(attribute.evidence?.trim())
}

export function publishableAttributes<T extends EvidenceAttribute>(attributes: T[]): T[] {
  return attributes.filter(isPublishableAttribute)
}
