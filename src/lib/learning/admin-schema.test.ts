import { describe, expect, it } from 'vitest'
import { adminLearningActionSchema } from './admin-schema'

const COURSE_ID = '00000000-0000-4000-8000-000000000901'
const MODULE_ID = '00000000-0000-4000-8000-000000000902'
const LESSON_ID = '00000000-0000-4000-8000-000000000903'

describe('adminLearningActionSchema', () => {
  it.each([
    {
      entity: 'course', action: 'create', slug: 'paid-traffic', title: 'Paid Traffic',
      description: '', sortOrder: 0, isPublished: false, releaseAt: null,
    },
    {
      entity: 'module', action: 'create', courseId: COURSE_ID, slug: 'campaigns', title: 'Campaigns',
      description: 'Campaign foundations', sortOrder: 1, isPublished: false, releaseAt: null,
    },
    {
      entity: 'lesson', action: 'create', moduleId: MODULE_ID, slug: 'first-campaign', title: 'First campaign',
      description: '', videoUrl: 'https://video.example.test/watch/1', durationSeconds: 900,
      sortOrder: 2, isPublished: true, releaseAt: '2026-09-10T18:00:00.000Z',
    },
    { entity: 'course', action: 'update', id: COURSE_ID, title: 'Updated course' },
    { entity: 'module', action: 'update', id: MODULE_ID, releaseAt: null, isPublished: false },
    { entity: 'lesson', action: 'update', id: LESSON_ID, videoUrl: '', durationSeconds: 0 },
    { entity: 'course', action: 'delete', id: COURSE_ID },
    { entity: 'module', action: 'delete', id: MODULE_ID },
    { entity: 'lesson', action: 'delete', id: LESSON_ID },
  ])('accepts the supported $action $entity action', (input) => {
    expect(adminLearningActionSchema.safeParse(input).success).toBe(true)
  })

  it('trims user-authored metadata without changing identifiers', () => {
    const parsed = adminLearningActionSchema.parse({
      entity: 'course', action: 'create', slug: 'course-one', title: ' Course one ',
      description: ' Description ', sortOrder: 0, isPublished: false, releaseAt: null,
    })

    expect(parsed).toMatchObject({ slug: 'course-one', title: 'Course one', description: 'Description' })
  })

  it.each([
    ['uppercase slug', { entity: 'course', action: 'create', slug: 'Course-One', title: 'Course', description: '', sortOrder: 0, isPublished: false, releaseAt: null }],
    ['slug longer than 100 characters', { entity: 'course', action: 'create', slug: `a${'b'.repeat(100)}`, title: 'Course', description: '', sortOrder: 0, isPublished: false, releaseAt: null }],
    ['empty title', { entity: 'course', action: 'create', slug: 'course', title: ' ', description: '', sortOrder: 0, isPublished: false, releaseAt: null }],
    ['title longer than 200 characters', { entity: 'course', action: 'create', slug: 'course', title: 'a'.repeat(201), description: '', sortOrder: 0, isPublished: false, releaseAt: null }],
    ['description longer than 5000 characters', { entity: 'course', action: 'create', slug: 'course', title: 'Course', description: 'a'.repeat(5001), sortOrder: 0, isPublished: false, releaseAt: null }],
    ['negative sort order', { entity: 'course', action: 'create', slug: 'course', title: 'Course', description: '', sortOrder: -1, isPublished: false, releaseAt: null }],
    ['sort order above 1000000', { entity: 'course', action: 'create', slug: 'course', title: 'Course', description: '', sortOrder: 1_000_001, isPublished: false, releaseAt: null }],
    ['malformed release timestamp', { entity: 'course', action: 'create', slug: 'course', title: 'Course', description: '', sortOrder: 0, isPublished: false, releaseAt: 'tomorrow' }],
    ['negative duration', { entity: 'lesson', action: 'create', moduleId: MODULE_ID, slug: 'lesson', title: 'Lesson', description: '', videoUrl: '', durationSeconds: -1, sortOrder: 0, isPublished: false, releaseAt: null }],
    ['duration above one day', { entity: 'lesson', action: 'create', moduleId: MODULE_ID, slug: 'lesson', title: 'Lesson', description: '', videoUrl: '', durationSeconds: 86_401, sortOrder: 0, isPublished: false, releaseAt: null }],
    ['non-HTTPS video URL', { entity: 'lesson', action: 'create', moduleId: MODULE_ID, slug: 'lesson', title: 'Lesson', description: '', videoUrl: 'http://video.example.test/1', durationSeconds: 60, sortOrder: 0, isPublished: false, releaseAt: null }],
    ['video URL longer than 2048 characters', { entity: 'lesson', action: 'create', moduleId: MODULE_ID, slug: 'lesson', title: 'Lesson', description: '', videoUrl: `https://video.example.test/${'a'.repeat(2022)}`, durationSeconds: 60, sortOrder: 0, isPublished: false, releaseAt: null }],
  ])('rejects %s', (_case, input) => {
    expect(adminLearningActionSchema.safeParse(input).success).toBe(false)
  })

  it.each([
    ['unknown fields', { entity: 'course', action: 'update', id: COURSE_ID, title: 'Course', role: 'admin' }],
    ['course parent on module update', { entity: 'module', action: 'update', id: MODULE_ID, courseId: COURSE_ID }],
    ['module parent on lesson update', { entity: 'lesson', action: 'update', id: LESSON_ID, moduleId: MODULE_ID }],
    ['empty update', { entity: 'course', action: 'update', id: COURSE_ID }],
    ['metadata on delete', { entity: 'lesson', action: 'delete', id: LESSON_ID, title: 'Not allowed' }],
    ['course fields on module create', { entity: 'module', action: 'create', courseId: COURSE_ID, slug: 'module', title: 'Module', description: '', sortOrder: 0, isPublished: false, releaseAt: null, videoUrl: '' }],
    ['missing course parent', { entity: 'module', action: 'create', slug: 'module', title: 'Module', description: '', sortOrder: 0, isPublished: false, releaseAt: null }],
    ['missing module parent', { entity: 'lesson', action: 'create', slug: 'lesson', title: 'Lesson', description: '', videoUrl: '', durationSeconds: 60, sortOrder: 0, isPublished: false, releaseAt: null }],
    ['invalid entity', { entity: 'material', action: 'delete', id: LESSON_ID }],
    ['invalid action', { entity: 'course', action: 'publish', id: COURSE_ID }],
  ])('rejects %s', (_case, input) => {
    expect(adminLearningActionSchema.safeParse(input).success).toBe(false)
  })
})
