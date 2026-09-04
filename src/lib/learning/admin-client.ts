export type AdminLearningEntity = 'course' | 'module' | 'lesson'

export interface AdminLessonDto {
  id: string
  moduleId: string
  slug: string
  title: string
  description: string
  videoUrl: string
  durationSeconds: number
  sortOrder: number
  isPublished: boolean
  releaseAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminModuleDto {
  id: string
  courseId: string
  slug: string
  title: string
  description: string
  sortOrder: number
  isPublished: boolean
  releaseAt: string | null
  createdAt: string
  updatedAt: string
  lessons: AdminLessonDto[]
}

export interface AdminCourseDto {
  id: string
  slug: string
  title: string
  description: string
  sortOrder: number
  isPublished: boolean
  releaseAt: string | null
  createdAt: string
  updatedAt: string
  modules: AdminModuleDto[]
}

interface EntityMetadataInput {
  slug: string
  title: string
  description: string
  sortOrder: number
  isPublished: boolean
  releaseAt: string | null
}

export type CreateCourseInput = EntityMetadataInput

export interface CreateModuleInput extends EntityMetadataInput {
  courseId: string
}

export interface CreateLessonInput extends EntityMetadataInput {
  moduleId: string
  videoUrl: string
  durationSeconds: number
}

export type UpdateCourseInput = Partial<EntityMetadataInput>
export type UpdateModuleInput = Partial<EntityMetadataInput>
export interface UpdateLessonInput extends Partial<EntityMetadataInput> {
  videoUrl?: string
  durationSeconds?: number
}

export type AdminApiErrorKind =
  | 'bad-request'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'server-error'

export class AdminApiError extends Error {
  kind: AdminApiErrorKind
  status: number

  constructor(kind: AdminApiErrorKind, status: number, message: string) {
    super(message)
    this.name = 'AdminApiError'
    this.kind = kind
    this.status = status
  }
}

function errorKindForStatus(status: number): AdminApiErrorKind {
  if (status === 400) return 'bad-request'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  return 'server-error'
}

async function parseJsonSafely(response: Response): Promise<{ error?: string } | null> {
  try {
    return (await response.json()) as { error?: string }
  } catch {
    return null
  }
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(input, init)
  } catch {
    throw new AdminApiError('server-error', 0, 'Network error while contacting admin learning API')
  }

  if (!response.ok) {
    const body = await parseJsonSafely(response)
    throw new AdminApiError(
      errorKindForStatus(response.status),
      response.status,
      body?.error ?? `Admin learning API request failed with status ${response.status}`
    )
  }

  return (await response.json()) as T
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export async function getAdminLearningTree(): Promise<AdminCourseDto[]> {
  const data = await requestJson<{ courses: AdminCourseDto[] }>('/api/admin/learning')
  return data.courses
}

function createEntity(
  entity: AdminLearningEntity,
  metadata: object
): Promise<{ id: string }> {
  return requestJson<{ id: string }>('/api/admin/learning', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ entity, action: 'create', ...metadata }),
  })
}

function updateEntity(
  entity: AdminLearningEntity,
  id: string,
  metadata: object
): Promise<{ id: string }> {
  return requestJson<{ id: string }>(`/api/admin/learning/${entity}/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(metadata),
  })
}

function deleteEntity(entity: AdminLearningEntity, id: string): Promise<{ success: true }> {
  return requestJson<{ success: true }>(`/api/admin/learning/${entity}/${id}`, { method: 'DELETE' })
}

export function createCourse(input: CreateCourseInput): Promise<{ id: string }> {
  return createEntity('course', input)
}

export function createModule(input: CreateModuleInput): Promise<{ id: string }> {
  return createEntity('module', input)
}

export function createLesson(input: CreateLessonInput): Promise<{ id: string }> {
  return createEntity('lesson', input)
}

export function updateCourse(id: string, input: UpdateCourseInput): Promise<{ id: string }> {
  return updateEntity('course', id, input)
}

export function updateModule(id: string, input: UpdateModuleInput): Promise<{ id: string }> {
  return updateEntity('module', id, input)
}

export function updateLesson(id: string, input: UpdateLessonInput): Promise<{ id: string }> {
  return updateEntity('lesson', id, input)
}

export function deleteCourse(id: string): Promise<{ success: true }> {
  return deleteEntity('course', id)
}

export function deleteModule(id: string): Promise<{ success: true }> {
  return deleteEntity('module', id)
}

export function deleteLesson(id: string): Promise<{ success: true }> {
  return deleteEntity('lesson', id)
}
