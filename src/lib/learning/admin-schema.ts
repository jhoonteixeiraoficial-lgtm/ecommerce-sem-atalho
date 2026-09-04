import { z } from 'zod'

const id = z.string().uuid()
const slug = z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const title = z.string().trim().min(1).max(200)
const description = z.string().trim().max(5000)
const sortOrder = z.number().int().min(0).max(1_000_000)
const releaseAt = z.string().datetime({ offset: true }).nullable()
const videoUrl = z.union([
  z.literal(''),
  z.string().max(2048).url().refine((value) => value.toLowerCase().startsWith('https://')),
])
const durationSeconds = z.number().int().min(0).max(86_400)

const courseMetadata = {
  slug,
  title,
  description,
  sortOrder,
  isPublished: z.boolean(),
  releaseAt,
}

const moduleMetadata = courseMetadata
const lessonMetadata = {
  ...courseMetadata,
  videoUrl,
  durationSeconds,
}

function updateSchema<T extends z.ZodRawShape>(entity: 'course' | 'module' | 'lesson', shape: T) {
  return z.object({
    entity: z.literal(entity),
    action: z.literal('update'),
    id,
    ...z.object(shape).partial().shape,
  }).strict().refine(
    (value) => Object.keys(value).some((key) => !['entity', 'action', 'id'].includes(key)),
    { message: 'At least one update field is required' },
  )
}

function deleteSchema(entity: 'course' | 'module' | 'lesson') {
  return z.object({ entity: z.literal(entity), action: z.literal('delete'), id }).strict()
}

export const adminLearningActionSchema = z.union([
  z.object({ entity: z.literal('course'), action: z.literal('create'), ...courseMetadata }).strict(),
  z.object({ entity: z.literal('module'), action: z.literal('create'), courseId: id, ...moduleMetadata }).strict(),
  z.object({ entity: z.literal('lesson'), action: z.literal('create'), moduleId: id, ...lessonMetadata }).strict(),
  updateSchema('course', courseMetadata),
  updateSchema('module', moduleMetadata),
  updateSchema('lesson', lessonMetadata),
  deleteSchema('course'),
  deleteSchema('module'),
  deleteSchema('lesson'),
])

export type AdminLearningAction = z.infer<typeof adminLearningActionSchema>
