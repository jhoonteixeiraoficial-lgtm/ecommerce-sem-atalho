import { afterEach, describe, expect, it, vi } from 'vitest'
import * as realtimeModule from './community-realtime'

const realtime = realtimeModule as Record<string, unknown>

interface Item {
  id: string
  created_at: string
  category?: string
  content: string
}

afterEach(() => {
  vi.useRealTimers()
})

describe('community realtime synchronization', () => {
  it('invalidates and aborts stale asynchronous generations', () => {
    const createSyncGeneration = realtime.createSyncGeneration as undefined | (() => {
      begin: () => { signal: AbortSignal; isCurrent: () => boolean }
    })

    const generations = createSyncGeneration?.()
    const first = generations?.begin()
    const second = generations?.begin()

    expect(first?.signal.aborted).toBe(true)
    expect(first?.isCurrent()).toBe(false)
    expect(second?.signal.aborted).toBe(false)
    expect(second?.isCurrent()).toBe(true)
  })

  it('deduplicates messages by ID and orders equal timestamps deterministically', () => {
    const mergeChronological = realtime.mergeChronological as undefined | ((
      current: Item[],
      incoming: Item[],
    ) => Item[])
    const current = [
      { id: 'b', created_at: '2026-09-02T10:00:00.000Z', content: 'old' },
      { id: 'a', created_at: '2026-09-02T10:00:00.000Z', content: 'a' },
    ]
    const incoming = [
      { id: 'b', created_at: '2026-09-02T10:00:00.000Z', content: 'updated' },
      { id: 'c', created_at: '2026-09-02T09:00:00.000Z', content: 'c' },
    ]

    expect(mergeChronological?.(current, incoming)).toEqual([
      { id: 'c', created_at: '2026-09-02T09:00:00.000Z', content: 'c' },
      { id: 'a', created_at: '2026-09-02T10:00:00.000Z', content: 'a' },
      { id: 'b', created_at: '2026-09-02T10:00:00.000Z', content: 'updated' },
    ])
  })

  it('normalizes feed snapshots to the active category with newest-first deduplication', () => {
    const normalizeFeedPosts = realtime.normalizeFeedPosts as undefined | ((
      posts: Item[],
      category: string,
    ) => Item[])
    const posts = [
      { id: 'a', category: 'geral', created_at: '2026-09-02T09:00:00.000Z', content: 'old' },
      { id: 'b', category: 'duvidas', created_at: '2026-09-02T11:00:00.000Z', content: 'hidden' },
      { id: 'a', category: 'geral', created_at: '2026-09-02T10:00:00.000Z', content: 'new' },
      { id: 'c', category: 'geral', created_at: '2026-09-02T10:00:00.000Z', content: 'c' },
    ]

    expect(normalizeFeedPosts?.(posts, 'geral')).toEqual([
      { id: 'c', category: 'geral', created_at: '2026-09-02T10:00:00.000Z', content: 'c' },
      { id: 'a', category: 'geral', created_at: '2026-09-02T10:00:00.000Z', content: 'new' },
    ])
  })

  it('coalesces refresh requests and cancellation prevents a stale callback', () => {
    vi.useFakeTimers()
    const createRefreshScheduler = realtime.createRefreshScheduler as undefined | ((
      refresh: () => void,
      delay: number,
    ) => { request: () => void; cancel: () => void })
    const refresh = vi.fn()
    const scheduler = createRefreshScheduler?.(refresh, 250)

    scheduler?.request()
    scheduler?.request()
    vi.advanceTimersByTime(249)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)

    scheduler?.request()
    scheduler?.cancel()
    vi.advanceTimersByTime(250)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
