import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAdminLearningTree,
  createCourse,
  createModule,
  createLesson,
  updateModule,
  updateLesson,
  deleteCourse,
  deleteLesson,
  AdminApiError,
} from './admin-client'
import type { AdminCourseDto } from './admin-client'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('admin learning API client', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  describe('getAdminLearningTree', () => {
    it('returns typed course tree on success', async () => {
      const courses: AdminCourseDto[] = [
        {
          id: 'course-1',
          slug: 'course-1',
          title: 'Course 1',
          description: 'desc',
          sortOrder: 0,
          isPublished: true,
          releaseAt: null,
          createdAt: '2026-09-03T00:00:00.000Z',
          updatedAt: '2026-09-03T00:00:00.000Z',
          modules: [
            {
              id: 'module-1',
              courseId: 'course-1',
              slug: 'module-1',
              title: 'Module 1',
              description: 'desc',
              sortOrder: 0,
              isPublished: true,
              releaseAt: null,
              createdAt: '2026-09-03T00:00:00.000Z',
              updatedAt: '2026-09-03T00:00:00.000Z',
              lessons: [
                {
                  id: 'lesson-1',
                  moduleId: 'module-1',
                  slug: 'lesson-1',
                  title: 'Lesson 1',
                  description: 'desc',
                  videoUrl: 'https://video.test/1',
                  durationSeconds: 120,
                  sortOrder: 0,
                  isPublished: false,
                  releaseAt: null,
                  thumbnailUrl: null,
                  createdAt: '2026-09-03T00:00:00.000Z',
                  updatedAt: '2026-09-03T00:00:00.000Z',
                },
              ],
            },
          ],
        },
      ]
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, { courses }))

      const result = await getAdminLearningTree()

      expect(result).toEqual(courses)
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/learning', undefined)
    })
  })

  describe('createCourse', () => {
    it('sends a strict create request body with only allowed course fields', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(201, { id: 'course-1' }))

      const result = await createCourse({
        slug: 'course-1',
        title: 'Course 1',
        description: 'desc',
        sortOrder: 0,
        isPublished: false,
        releaseAt: null,
      })

      expect(result).toEqual({ id: 'course-1' })
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: 'course',
          action: 'create',
          slug: 'course-1',
          title: 'Course 1',
          description: 'desc',
          sortOrder: 0,
          isPublished: false,
          releaseAt: null,
        }),
      })
    })
  })

  describe('createModule', () => {
    it('sends a strict create request body scoped to a courseId', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(201, { id: 'module-1' }))

      await createModule({
        courseId: 'course-1',
        slug: 'module-1',
        title: 'Module 1',
        description: 'desc',
        sortOrder: 0,
        isPublished: false,
        releaseAt: null,
      })

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: 'module',
          action: 'create',
          courseId: 'course-1',
          slug: 'module-1',
          title: 'Module 1',
          description: 'desc',
          sortOrder: 0,
          isPublished: false,
          releaseAt: null,
        }),
      })
    })
  })

  describe('createLesson', () => {
    it('sends a strict create request body scoped to a moduleId', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(201, { id: 'lesson-1' }))

      await createLesson({
        moduleId: 'module-1',
        slug: 'lesson-1',
        title: 'Lesson 1',
        description: 'desc',
        sortOrder: 0,
        isPublished: false,
        releaseAt: null,
        videoUrl: 'https://video.test/1',
        durationSeconds: 120,
      })

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: 'lesson',
          action: 'create',
          moduleId: 'module-1',
          slug: 'lesson-1',
          title: 'Lesson 1',
          description: 'desc',
          sortOrder: 0,
          isPublished: false,
          releaseAt: null,
          videoUrl: 'https://video.test/1',
          durationSeconds: 120,
        }),
      })
    })
  })

  describe('updateModule', () => {
    it('PATCHes only the changed fields, never the id/entity/action', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, { id: 'module-1' }))

      const result = await updateModule('module-1', { isPublished: true })

      expect(result).toEqual({ id: 'module-1' })
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/learning/module/module-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: true }),
      })
    })
  })

  describe('deleteCourse', () => {
    it('sends a DELETE request with no body', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, { success: true }))

      const result = await deleteCourse('course-1')

      expect(result).toEqual({ success: true })
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/learning/course/course-1', {
        method: 'DELETE',
      })
    })
  })

  describe('error handling', () => {
    it('rejects with a conflict signal on 409', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        jsonResponse(409, { error: 'Unable to update learning content' })
      )

      await expect(updateLesson('lesson-1', { slug: 'taken-slug' })).rejects.toMatchObject({
        kind: 'conflict',
      })
    })

    it('rejects with an unauthorized signal on 401', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }))

      await expect(getAdminLearningTree()).rejects.toMatchObject({ kind: 'unauthorized' })
    })

    it('rejects with a forbidden signal on 403', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(403, { error: 'Forbidden' }))

      await expect(createCourse({
        slug: 'course-1',
        title: 'Course 1',
        description: '',
        sortOrder: 0,
        isPublished: false,
        releaseAt: null,
      })).rejects.toMatchObject({ kind: 'forbidden' })
    })

    it('rejects with a server-error signal, preserving the error message, on a generic 500', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        jsonResponse(500, { error: 'Unable to delete learning content' })
      )

      await expect(deleteLesson('lesson-1')).rejects.toBeInstanceOf(AdminApiError)
      vi.mocked(globalThis.fetch).mockResolvedValue(
        jsonResponse(500, { error: 'Unable to delete learning content' })
      )
      await expect(deleteLesson('lesson-1')).rejects.toMatchObject({
        kind: 'server-error',
        message: 'Unable to delete learning content',
      })
    })
  })
})
