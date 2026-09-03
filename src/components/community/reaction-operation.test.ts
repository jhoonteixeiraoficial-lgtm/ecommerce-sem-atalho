import { describe, expect, it, vi } from 'vitest'
import { attemptReactionOperation, createReactionOperationTracker } from './reaction-operation'

describe('reaction operation tracker', () => {
  it('reuses an operation UUID after an ambiguous failure', () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000101')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000102')
    const tracker = createReactionOperationTracker(randomUUID)

    const firstAttempt = tracker.start('post-1', 'like')
    const retry = tracker.start('post-1', 'like')

    expect(firstAttempt).toBe('00000000-0000-4000-8000-000000000101')
    expect(retry).toBe(firstAttempt)
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('allocates a new UUID after the prior operation succeeds', () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000101')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000102')
    const tracker = createReactionOperationTracker(randomUUID)

    const completed = tracker.start('post-1', 'like')
    tracker.succeed('post-1', 'like', completed)

    expect(tracker.start('post-1', 'like')).toBe('00000000-0000-4000-8000-000000000102')
  })

  it('does not clear a newer operation when an older response completes', () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000101')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000102')
    const tracker = createReactionOperationTracker(randomUUID)

    const first = tracker.start('post-1', 'like')
    tracker.succeed('post-1', 'like', first)
    const second = tracker.start('post-1', 'like')
    tracker.succeed('post-1', 'like', first)

    expect(tracker.start('post-1', 'like')).toBe(second)
  })

  it('retains the UUID when an attempted request has no conclusive success', async () => {
    const tracker = createReactionOperationTracker(() => '00000000-0000-4000-8000-000000000101')
    const attempt = vi.fn().mockResolvedValue(false)

    await attemptReactionOperation(tracker, 'post-1', 'like', attempt)
    await attemptReactionOperation(tracker, 'post-1', 'like', attempt)

    expect(attempt).toHaveBeenNthCalledWith(1, '00000000-0000-4000-8000-000000000101')
    expect(attempt).toHaveBeenNthCalledWith(2, '00000000-0000-4000-8000-000000000101')
  })

  it('rotates the UUID only after an attempted request succeeds', async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000101')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000102')
    const tracker = createReactionOperationTracker(randomUUID)
    const attempt = vi.fn().mockResolvedValue(true)

    await attemptReactionOperation(tracker, 'post-1', 'like', attempt)
    await attemptReactionOperation(tracker, 'post-1', 'like', attempt)

    expect(attempt).toHaveBeenNthCalledWith(1, '00000000-0000-4000-8000-000000000101')
    expect(attempt).toHaveBeenNthCalledWith(2, '00000000-0000-4000-8000-000000000102')
  })
})
