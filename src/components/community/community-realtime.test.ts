import { afterEach, describe, expect, it, vi } from 'vitest'
import * as realtimeModule from './community-realtime'

const realtime = realtimeModule as Record<string, unknown>

interface Item {
  id: string
  created_at: string
  category?: string
  content: string
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
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

  it('discards an older overlapping chat snapshot instead of reverting a newer edit', async () => {
    const createSnapshotCoordinator = realtime.createSnapshotCoordinator as undefined | (<T>(options: {
      load: (signal: AbortSignal) => Promise<T>
      apply: (snapshot: T) => void
    }) => { refresh: () => Promise<void> })
    const requests: ReturnType<typeof deferred<Item[]>>[] = []
    const applied: Item[][] = []
    const coordinator = createSnapshotCoordinator?.<Item[]>({
      load: () => {
        const request = deferred<Item[]>()
        requests.push(request)
        return request.promise
      },
      apply: (snapshot) => applied.push(snapshot),
    })

    const older = coordinator?.refresh()
    const newer = coordinator?.refresh()
    expect(requests).toHaveLength(2)

    requests[1].resolve([{ id: 'message', created_at: '2026-09-03T10:00:00Z', content: 'edited' }])
    await newer
    requests[0].resolve([{ id: 'message', created_at: '2026-09-03T10:00:00Z', content: 'old' }])
    await older

    expect(applied).toEqual([[
      { id: 'message', created_at: '2026-09-03T10:00:00Z', content: 'edited' },
    ]])
  })

  it('discards a chat snapshot invalidated by a delete and reschedules an authoritative load', async () => {
    const createSnapshotCoordinator = realtime.createSnapshotCoordinator as undefined | (<T>(options: {
      load: (signal: AbortSignal) => Promise<T>
      apply: (snapshot: T) => void
    }) => { refresh: () => Promise<void>; invalidate: () => void })
    const requests: ReturnType<typeof deferred<Item[]>>[] = []
    const applied: Item[][] = []
    const coordinator = createSnapshotCoordinator?.<Item[]>({
      load: () => {
        const request = deferred<Item[]>()
        requests.push(request)
        return request.promise
      },
      apply: (snapshot) => applied.push(snapshot),
    })

    const refresh = coordinator?.refresh()
    coordinator?.invalidate()
    requests[0]?.resolve([{ id: 'deleted', created_at: '2026-09-03T10:00:00Z', content: 'deleted' }])
    await Promise.resolve()
    expect(requests).toHaveLength(2)
    requests[1].resolve([])
    await refresh

    expect(applied).toEqual([[]])
  })

  it('refreshes an expanded comment thread after an invalidating realtime event', async () => {
    const createKeyedSnapshotCoordinator = realtime.createKeyedSnapshotCoordinator as undefined | (<T>(options: {
      load: (key: string, signal: AbortSignal) => Promise<T>
      apply: (key: string, snapshot: T) => void
    }) => { refresh: (key: string) => Promise<void>; invalidate: (key: string) => void })
    const requests: ReturnType<typeof deferred<Item[]>>[] = []
    const applied: Array<{ postId: string; comments: Item[] }> = []
    const coordinator = createKeyedSnapshotCoordinator?.<Item[]>({
      load: () => {
        const request = deferred<Item[]>()
        requests.push(request)
        return request.promise
      },
      apply: (postId, comments) => applied.push({ postId, comments }),
    })

    const refresh = coordinator?.refresh('post-1')
    coordinator?.invalidate('post-1')
    requests[0]?.resolve([{ id: 'comment', created_at: '2026-09-03T10:00:00Z', content: 'old' }])
    await Promise.resolve()
    expect(requests).toHaveLength(2)
    requests[1].resolve([{ id: 'comment', created_at: '2026-09-03T10:00:00Z', content: 'updated' }])
    await refresh

    expect(applied).toEqual([{
      postId: 'post-1',
      comments: [{ id: 'comment', created_at: '2026-09-03T10:00:00Z', content: 'updated' }],
    }])
  })

  it('routes every comment change to post counts and all expanded comment threads', () => {
    const createFeedChangeCoordinator = realtime.createFeedChangeCoordinator as undefined | ((options: {
      invalidatePosts: () => void
      requestPosts: () => void
      expandedPostIds: () => Iterable<string>
      invalidateComments: (postId: string) => void
      requestComments: () => void
    }) => { commentChanged: () => void })
    const transitions: string[] = []
    const coordinator = createFeedChangeCoordinator?.({
      invalidatePosts: () => transitions.push('posts:invalidate'),
      requestPosts: () => transitions.push('posts:request'),
      expandedPostIds: () => ['post-1', 'post-2'],
      invalidateComments: (postId) => transitions.push(`comments:invalidate:${postId}`),
      requestComments: () => transitions.push('comments:request'),
    })

    coordinator?.commentChanged()

    expect(transitions).toEqual([
      'posts:invalidate',
      'posts:request',
      'comments:invalidate:post-1',
      'comments:invalidate:post-2',
      'comments:request',
    ])
  })

  it('keeps a delayed failed draft per channel while another channel remains sendable', async () => {
    const createChannelComposer = realtime.createChannelComposer as undefined | (() => {
      beginSend: (channelId: string, content: string) => unknown
      fail: (operation: unknown) => void
      isSending: (channelId: string) => boolean
      getDraft: (channelId: string) => string
      setDraft: (channelId: string, content: string) => void
      setActiveChannel?: (channelId: string | null) => void
      isActive?: (channelId: string) => boolean
    })
    const composer = createChannelComposer?.()
    composer?.setActiveChannel?.('channel-a')
    const channelASend = composer?.beginSend('channel-a', 'unsent A')
    const pendingSend = deferred<void>()
    const failure = pendingSend.promise.catch(() => composer?.fail(channelASend))

    composer?.setActiveChannel?.('channel-b')
    composer?.setDraft('channel-b', 'draft B')
    expect(composer?.isSending('channel-a')).toBe(true)
    expect(composer?.isSending('channel-b')).toBe(false)
    pendingSend.reject(new Error('network failure'))
    await failure

    composer?.setActiveChannel?.('channel-a')
    expect(composer?.getDraft('channel-a')).toBe('unsent A')
    expect(composer?.getDraft('channel-b')).toBe('draft B')
    expect(composer?.isActive?.('channel-a')).toBe(true)
    expect(composer?.isActive?.('channel-b')).toBe(false)
  })

  it('stops fallback polling immediately when realtime recovers', () => {
    vi.useFakeTimers()
    const createRealtimeRecovery = realtime.createRealtimeRecovery as undefined | ((
      refresh: () => void,
      interval: number,
    ) => { failed: () => void; recovered: () => void; cancel: () => void })
    const refresh = vi.fn()
    const recovery = createRealtimeRecovery?.(refresh, 1000)

    recovery?.failed()
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(2)
    recovery?.recovered()
    vi.advanceTimersByTime(5000)

    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
