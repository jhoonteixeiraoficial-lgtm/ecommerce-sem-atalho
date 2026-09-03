interface TimestampedItem {
  id: string
  created_at: string
}

interface CategorizedItem extends TimestampedItem {
  category: string
}

export function createSyncGeneration() {
  let generation = 0
  let controller: AbortController | null = null

  return {
    begin() {
      controller?.abort()
      controller = new AbortController()
      const activeController = controller
      const current = ++generation

      return {
        signal: activeController.signal,
        isCurrent: () => current === generation && !activeController.signal.aborted,
      }
    },
    cancel() {
      generation += 1
      controller?.abort()
      controller = null
    },
  }
}

export function mergeChronological<T extends TimestampedItem>(current: T[], incoming: T[]) {
  const byId = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) byId.set(item.id, item)

  return [...byId.values()].sort((left, right) => (
    left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
  ))
}

export function normalizeFeedPosts<T extends CategorizedItem>(posts: T[], category: string) {
  const byId = new Map<string, T>()
  for (const post of posts) {
    if (category === 'all' || post.category === category) byId.set(post.id, post)
  }

  return [...byId.values()].sort((left, right) => (
    right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id)
  ))
}

export function createRefreshScheduler(refresh: () => void, delay: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null

  return {
    request() {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        timeout = null
        refresh()
      }, delay)
    },
    cancel() {
      if (timeout) clearTimeout(timeout)
      timeout = null
    },
  }
}

interface SnapshotCoordinatorOptions<T> {
  load: (signal: AbortSignal) => Promise<T>
  apply: (snapshot: T) => void
  onError?: (error: unknown) => void
}

export function createSnapshotCoordinator<T>({
  load,
  apply,
  onError,
}: SnapshotCoordinatorOptions<T>) {
  let revision = 0
  let requestId = 0
  let controller: AbortController | null = null

  const refresh = async (): Promise<void> => {
    const currentRequest = ++requestId
    const revisionAtStart = revision
    controller?.abort()
    controller = new AbortController()
    const activeController = controller

    try {
      const snapshot = await load(activeController.signal)
      if (activeController.signal.aborted || currentRequest !== requestId) return
      if (revisionAtStart !== revision) return refresh()
      apply(snapshot)
    } catch (error) {
      if (!activeController.signal.aborted && currentRequest === requestId) onError?.(error)
    }
  }

  return {
    refresh,
    invalidate() {
      revision += 1
    },
    cancel() {
      requestId += 1
      controller?.abort()
      controller = null
    },
  }
}

interface KeyedSnapshotCoordinatorOptions<T> {
  load: (key: string, signal: AbortSignal) => Promise<T>
  apply: (key: string, snapshot: T) => void
  onError?: (key: string, error: unknown) => void
}

export function createKeyedSnapshotCoordinator<T>({
  load,
  apply,
  onError,
}: KeyedSnapshotCoordinatorOptions<T>) {
  const coordinators = new Map<string, ReturnType<typeof createSnapshotCoordinator<T>>>()

  const forKey = (key: string) => {
    let coordinator = coordinators.get(key)
    if (!coordinator) {
      coordinator = createSnapshotCoordinator({
        load: (signal) => load(key, signal),
        apply: (snapshot) => apply(key, snapshot),
        onError: (error) => onError?.(key, error),
      })
      coordinators.set(key, coordinator)
    }
    return coordinator
  }

  return {
    refresh: (key: string) => forKey(key).refresh(),
    invalidate: (key: string) => forKey(key).invalidate(),
    cancel(key?: string) {
      if (key !== undefined) {
        coordinators.get(key)?.cancel()
        coordinators.delete(key)
        return
      }
      for (const coordinator of coordinators.values()) coordinator.cancel()
      coordinators.clear()
    },
  }
}

export interface ChannelSendOperation {
  channelId: string
  content: string
  id: number
}

export function createChannelComposer() {
  const drafts = new Map<string, string>()
  const activeSends = new Map<string, number>()
  let operationId = 0
  let activeChannelId: string | null = null

  const finish = (operation: ChannelSendOperation) => {
    if (activeSends.get(operation.channelId) !== operation.id) return false
    activeSends.delete(operation.channelId)
    return true
  }

  return {
    beginSend(channelId: string, content: string): ChannelSendOperation {
      const operation = { channelId, content, id: ++operationId }
      activeSends.set(channelId, operation.id)
      drafts.set(channelId, '')
      return operation
    },
    succeed(operation: ChannelSendOperation) {
      return finish(operation)
    },
    fail(operation: ChannelSendOperation) {
      if (!finish(operation)) return false
      drafts.set(operation.channelId, operation.content)
      return true
    },
    isSending(channelId: string) {
      return activeSends.has(channelId)
    },
    getDraft(channelId: string) {
      return drafts.get(channelId) || ''
    },
    setDraft(channelId: string, content: string) {
      drafts.set(channelId, content)
    },
    setActiveChannel(channelId: string | null) {
      activeChannelId = channelId
    },
    isActive(channelId: string) {
      return activeChannelId === channelId
    },
  }
}

export function createRealtimeRecovery(refresh: () => void, intervalMs: number) {
  let polling: ReturnType<typeof setInterval> | null = null

  const stop = () => {
    if (polling) clearInterval(polling)
    polling = null
  }

  return {
    failed() {
      if (polling) return
      refresh()
      polling = setInterval(refresh, intervalMs)
    },
    recovered: stop,
    cancel: stop,
  }
}

interface FeedChangeCoordinatorOptions {
  invalidatePosts: () => void
  requestPosts: () => void
  expandedPostIds: () => Iterable<string>
  invalidateComments: (postId: string) => void
  requestComments: () => void
}

export function createFeedChangeCoordinator({
  invalidatePosts,
  requestPosts,
  expandedPostIds,
  invalidateComments,
  requestComments,
}: FeedChangeCoordinatorOptions) {
  const contentChanged = () => {
    invalidatePosts()
    requestPosts()
  }

  return {
    contentChanged,
    commentChanged() {
      contentChanged()
      for (const postId of expandedPostIds()) invalidateComments(postId)
      requestComments()
    },
  }
}
