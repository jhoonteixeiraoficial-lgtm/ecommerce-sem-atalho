export type CourseCatalogDto = {
  id: string
  slug: string
  title: string
  description: string
  sortOrder: number
  isPublished: boolean
  releaseAt: string | null
  modules: ModuleCatalogDto[]
}

export type ModuleCatalogDto = {
  id: string
  slug: string
  title: string
  description: string
  sortOrder: number
  isPublished: boolean
  releaseAt: string | null
  lessonCount: number
  completedCount: number
  progressPercentage: number
}

export type ModuleDetailDto = {
  id: string
  slug: string
  title: string
  description: string
  sortOrder: number
  isPublished: boolean
  releaseAt: string | null
  courseSlug: string
  lessons: LessonDetailDto[]
}

export type LessonDetailDto = {
  id: string
  slug: string
  title: string
  description: string
  videoUrl: string
  thumbnailUrl: string | null
  durationSeconds: number
  sortOrder: number
  isPublished: boolean
  releaseAt: string | null
  moduleSlug: string
  progress: LessonProgressDto | null
  prevLesson: { slug: string; title: string } | null
  nextLesson: { slug: string; title: string } | null
}

export type LessonProgressDto = {
  positionSeconds: number
  completed: boolean
  completedAt: string | null
  lastViewedAt: string | null
}

export type LessonProgressInput = {
  user_id: string
  lesson_id: string
  position_seconds: number
  started_at: string
  last_viewed_at: string
  completed: boolean
  completed_at: string | null
}

export type ProgressUpdateRequest = {
  lessonId: string
  positionSeconds: number
  completed?: boolean
}

export type ProgressUpdateResponse = {
  progress: LessonProgressDto
}

export type LessonWithProgress = LessonDetailDto & {
  progress: {
    positionSeconds: number
    completed: boolean
    lastViewedAt: string | null
  }
  module: { id: string; slug: string; title: string; isPublished: boolean; releaseAt: string | null; sortOrder: number }
}