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
