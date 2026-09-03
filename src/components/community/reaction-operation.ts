export interface ReactionOperationTracker {
  start(postId: string, reactionType: string): string
  succeed(postId: string, reactionType: string, operationId: string): void
}

export function createReactionOperationTracker(
  randomUUID: () => string = () => crypto.randomUUID(),
): ReactionOperationTracker {
  const pending = new Map<string, string>()
  const keyFor = (postId: string, reactionType: string) => `${postId}:${reactionType}`

  return {
    start(postId, reactionType) {
      const key = keyFor(postId, reactionType)
      const existing = pending.get(key)
      if (existing) return existing

      const operationId = randomUUID()
      pending.set(key, operationId)
      return operationId
    },
    succeed(postId, reactionType, operationId) {
      const key = keyFor(postId, reactionType)
      if (pending.get(key) === operationId) pending.delete(key)
    },
  }
}

export async function attemptReactionOperation(
  tracker: ReactionOperationTracker,
  postId: string,
  reactionType: string,
  attempt: (operationId: string) => Promise<boolean>,
) {
  const operationId = tracker.start(postId, reactionType)
  const succeeded = await attempt(operationId)
  if (succeeded) tracker.succeed(postId, reactionType, operationId)
  return succeeded
}
