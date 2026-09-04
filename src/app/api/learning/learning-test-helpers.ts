import { vi } from 'vitest'

/**
 * Builds a chainable Supabase query-builder mock. Every chain method
 * (select/eq/in/lte/or/order/upsert) returns the same builder so tests can
 * call `.eq().eq().single()` in any order the route code uses. The
 * builder is also thenable so `await builder` resolves `result` for
 * routes that never call `.single()`.
 */
export function makeQueryBuilder(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = vi.fn(chain)
  builder.eq = vi.fn(chain)
  builder.in = vi.fn(chain)
  builder.lte = vi.fn(chain)
  builder.or = vi.fn(chain)
  builder.order = vi.fn(chain)
  builder.upsert = vi.fn(chain)
  builder.single = vi.fn(async () => result)
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return builder
}

/**
 * Builds a `.from(table)` mock that returns queued builders per table in
 * call order (first call to `.from('lessons')` gets queues.lessons[0],
 * the second call gets queues.lessons[1], etc). The last queued builder
 * is reused if a table is called more times than it has queued builders.
 */
export function makeFromMock(queues: Record<string, ReturnType<typeof makeQueryBuilder>[]>) {
  const counters: Record<string, number> = {}
  return vi.fn((table: string) => {
    const queue = queues[table] ?? []
    const index = counters[table] ?? 0
    counters[table] = index + 1
    const builder = queue[index] ?? queue[queue.length - 1]
    if (!builder) {
      throw new Error(`No mock query builder configured for table "${table}" (call #${index})`)
    }
    return builder
  })
}

export function authError(status: number, message = 'Auth error') {
  return Object.assign(new Error(message), { status })
}
