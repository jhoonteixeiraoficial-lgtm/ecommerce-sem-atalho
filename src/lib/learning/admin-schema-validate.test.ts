import { describe, expect, it } from 'vitest'
import { adminLearningActionSchema } from './admin-schema'

describe('lesson create — exact frontend payload', () => {
  it('accepts the exact payload VideoUpload sends (no slug, no duration)', () => {
    const payload = {
      entity: 'lesson',
      action: 'create',
      moduleId: '00000000-0000-4000-8000-000000000902',
      title: 'Como Vender no Mercado Livre',
      description: '',
      videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0',
      isPublished: false,
      releaseAt: null,
    }
    const result = adminLearningActionSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('accepts payload with thumbnailUrl', () => {
    const payload = {
      entity: 'lesson',
      action: 'create',
      moduleId: '00000000-0000-4000-8000-000000000902',
      title: 'Aula Teste',
      description: '',
      videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0',
      thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
      isPublished: false,
      releaseAt: null,
    }
    const result = adminLearningActionSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('accepts empty string videoUrl (upload mode)', () => {
    const payload = {
      entity: 'lesson',
      action: 'create',
      moduleId: '00000000-0000-4000-8000-000000000902',
      title: 'Upload Aula',
      description: '',
      videoUrl: '',
      isPublished: false,
      releaseAt: null,
    }
    const result = adminLearningActionSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('REJECTS payload with extra unknown field (strict mode)', () => {
    const payload = {
      entity: 'lesson',
      action: 'create',
      moduleId: '00000000-0000-4000-8000-000000000902',
      title: 'Aula Teste',
      description: '',
      videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0',
      isPublished: false,
      releaseAt: null,
      extraField: 'should fail',
    }
    const result = adminLearningActionSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('shows exactly which fields fail when validation fails', () => {
    const payload = {
      entity: 'lesson',
      action: 'create',
      moduleId: 'not-a-uuid',
      title: '',
      description: '',
      videoUrl: 'not-a-url',
      isPublished: false,
      releaseAt: 'invalid',
    }
    const result = adminLearningActionSchema.safeParse(payload)
    expect(result.success).toBe(false)
    if (!result.success) {
      console.log('VALIDATION ERRORS:', JSON.stringify(result.error.flatten(), null, 2))
    }
  })
})
