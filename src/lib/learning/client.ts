import type {
  CourseCatalogDto,
  ModuleDetailDto,
  LessonDetailDto,
  ProgressUpdateRequest,
  ProgressUpdateResponse,
} from './types'

export type LearningApiErrorKind = 'unauthorized' | 'forbidden' | 'not-found' | 'server-error'

export class LearningApiError extends Error {
  kind: LearningApiErrorKind

  constructor(kind: LearningApiErrorKind, message: string) {
    super(message)
    this.name = 'LearningApiError'
    this.kind = kind
  }
}

function errorKindForStatus(status: number): LearningApiErrorKind {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
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
    throw new LearningApiError('server-error', 'Network error while contacting learning API')
  }

  if (!response.ok) {
    const body = await parseJsonSafely(response)
    throw new LearningApiError(
      errorKindForStatus(response.status),
      body?.error ?? `Learning API request failed with status ${response.status}`
    )
  }

  return (await response.json()) as T
}

export async function getCatalog(): Promise<CourseCatalogDto[]> {
  const data = await requestJson<{ catalog: CourseCatalogDto[] }>('/api/learning/catalog')
  return data.catalog
}

export async function getModule(moduleSlug: string): Promise<ModuleDetailDto> {
  const data = await requestJson<{ module: ModuleDetailDto }>(
    `/api/learning/modules/${encodeURIComponent(moduleSlug)}`
  )
  return data.module
}

export async function getLesson(moduleSlug: string, lessonSlug: string): Promise<LessonDetailDto> {
  const data = await requestJson<{ lesson: LessonDetailDto }>(
    `/api/learning/lessons/${encodeURIComponent(moduleSlug)}/${encodeURIComponent(lessonSlug)}`
  )
  return data.lesson
}

export async function updateProgress(input: ProgressUpdateRequest): Promise<ProgressUpdateResponse> {
  return requestJson<ProgressUpdateResponse>('/api/learning/progress', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
