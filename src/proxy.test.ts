import { describe, expect, it } from 'vitest'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { config } from './proxy'

describe('proxy matcher', () => {
  it('protects admin API routes', () => {
    expect(unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: '/api/admin/users',
    })).toBe(true)
  })

  it('leaves community API routes to their route handlers', () => {
    expect(unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: '/api/community/posts',
    })).toBe(false)
  })
})
