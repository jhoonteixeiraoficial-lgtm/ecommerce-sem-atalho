import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCatalog,
  getModule,
  getLesson,
  updateProgress,
  LearningApiError,
} from './client'
import type { CourseCatalogDto, ModuleDetailDto, LessonDetailDto } from './types'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('learning API client', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  describe('getCatalog', () => {
    it('returns typed catalog on success', async () => {
      const catalog: CourseCatalogDto[] = [
        {
          id: 'course-1',
          slug: 'course-1',
          title: 'Course 1',
          description: 'desc',
          sortOrder: 0,
          isPublished: true,
          releaseAt: null,
          modules: [
            {
              id: 'module-1',
              slug: 'module-1',
              title: 'Module 1',
              description: 'desc',
              sortOrder: 0,
              isPublished: true,
              releaseAt: null,
              lessonCount: 3,
              completedCount: 1,
              progressPercentage: 33,
            },
          ],
        },
      ]
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, { catalog }))

      const result = await getCatalog()

      expect(result).toEqual(catalog)
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/learning/catalog', undefined)
    })

    it('throws unauthorized signal on 401', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }))

      await expect(getCatalog()).rejects.toMatchObject({ kind: 'unauthorized' })
    })

    it('throws forbidden signal on 403', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(403, { error: 'Access denied' }))

      await expect(getCatalog()).rejects.toMatchObject({ kind: 'forbidden' })
    })

    it('throws server-error signal on generic 500', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(500, { error: 'Failed to fetch catalog' }))

      await expect(getCatalog()).rejects.toMatchObject({ kind: 'server-error' })
    })
  })

  describe('getModule', () => {
    it('returns typed module on success', async () => {
      const moduleDto: ModuleDetailDto = {
        id: 'module-1',
        slug: 'module-1',
        title: 'Module 1',
        description: 'desc',
        sortOrder: 0,
        isPublished: true,
        releaseAt: null,
        courseSlug: 'course-1',
        lessons: [],
      }
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, { module: moduleDto }))

      const result = await getModule('module-1')

      expect(result).toEqual(moduleDto)
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/learning/modules/module-1', undefined)
    })

    it('throws not-found signal on 404 (empty state)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(404, { error: 'Module not found' }))

      await expect(getModule('missing-module')).rejects.toMatchObject({ kind: 'not-found' })
    })
  })

  describe('getLesson', () => {
    it('returns typed lesson on success', async () => {
      const lessonDto: LessonDetailDto = {
        id: 'lesson-1',
        slug: 'lesson-1',
        title: 'Lesson 1',
        description: 'desc',
        videoUrl: 'https://video.test/1',
        thumbnailUrl: null,
        durationSeconds: 120,
        sortOrder: 0,
        isPublished: true,
        releaseAt: null,
        moduleSlug: 'module-1',
        progress: null,
        prevLesson: null,
        nextLesson: null,
      }
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, { lesson: lessonDto }))

      const result = await getLesson('module-1', 'lesson-1')

      expect(result).toEqual(lessonDto)
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/learning/lessons/module-1/lesson-1', undefined)
    })

    it('throws not-found signal on 404 (empty state)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(404, { error: 'Lesson not found' }))

      await expect(getLesson('module-1', 'missing-lesson')).rejects.toMatchObject({ kind: 'not-found' })
    })
  })

  describe('updateProgress', () => {
    it('sends a PATCH request and returns typed progress on success', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        jsonResponse(200, {
          progress: {
            positionSeconds: 42,
            completed: false,
            completedAt: null,
            lastViewedAt: '2026-09-03T12:00:00.000Z',
          },
        })
      )

      const result = await updateProgress({ lessonId: 'lesson-1', positionSeconds: 42 })

      expect(result.progress.positionSeconds).toBe(42)
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/learning/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: 'lesson-1', positionSeconds: 42 }),
      })
    })

    it('rejects with a LearningApiError on failure, preserving prior state for the caller', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(500, { error: 'Failed to update progress' }))

      let localPosition = 10
      try {
        await updateProgress({ lessonId: 'lesson-1', positionSeconds: 99 })
        localPosition = 99
      } catch (e) {
        expect(e).toBeInstanceOf(LearningApiError)
        expect((e as LearningApiError).kind).toBe('server-error')
      }

      expect(localPosition).toBe(10)
    })
  })
})
