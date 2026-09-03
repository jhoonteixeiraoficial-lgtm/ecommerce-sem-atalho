import { beforeEach, describe, expect, it, vi } from 'vitest'

const MEMBER_ID = '00000000-0000-4000-8000-000000000001'
const RESOURCE_ID = '00000000-0000-4000-8000-000000000002'
const OPERATION_ID = '00000000-0000-4000-8000-000000000003'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServerGuards: vi.fn(),
  requireUser: vi.fn(),
  checkRateLimit: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  adminRpc: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}))

vi.mock('@/lib/auth/server-guards', () => ({
  createServerGuards: mocks.createServerGuards,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/security', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/security')>(),
  checkRateLimit: mocks.checkRateLimit,
}))

import {
  DELETE as deletePost,
  GET as getPosts,
  POST as createPost,
  PUT as updatePost,
} from './posts/route'
import {
  DELETE as deleteComment,
  GET as getComments,
  POST as createComment,
  PUT as updateComment,
} from './comments/route'
import { GET as getReactions, POST as toggleReaction } from './reactions/route'
import {
  DELETE as deleteMessage,
  GET as getChat,
  POST as createMessage,
  PUT as updateMessage,
} from './chat/route'

interface QueryCall {
  table: string
  method: string
  args: unknown[]
}

const queryCalls: QueryCall[] = []
const tableResults = new Map<string, { data: unknown; error: unknown }>()
const singleResults = new Map<string, { data: unknown; error: unknown }>()

function queryFor(table: string) {
  const record = (method: string, args: unknown[]) => {
    queryCalls.push({ table, method, args })
    return query
  }
  const query = {
    select: (...args: unknown[]) => record('select', args),
    insert: (...args: unknown[]) => record('insert', args),
    update: (...args: unknown[]) => record('update', args),
    delete: (...args: unknown[]) => record('delete', args),
    eq: (...args: unknown[]) => record('eq', args),
    in: (...args: unknown[]) => record('in', args),
    order: (...args: unknown[]) => record('order', args),
    range: (...args: unknown[]) => record('range', args),
    single: () => Promise.resolve(singleResults.get(table) ?? { data: null, error: null }),
    maybeSingle: () => Promise.resolve(singleResults.get(table) ?? { data: null, error: null }),
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(tableResults.get(table) ?? { data: [], error: null }).then(resolve, reject),
  }
  return query
}

function request(path: string, method = 'GET', body?: unknown) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { 'x-forwarded-for': '203.0.113.10' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function rawRequest(path: string, method: string, body: string) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
}

function findCall(table: string, method: string) {
  return queryCalls.find((call) => call.table === table && call.method === method)
}

beforeEach(() => {
  vi.clearAllMocks()
  queryCalls.length = 0
  tableResults.clear()
  singleResults.clear()
  mocks.getUser.mockResolvedValue({
    data: { user: { id: MEMBER_ID, email: 'member@example.test' } },
    error: null,
  })
  mocks.requireUser.mockResolvedValue({
    id: MEMBER_ID,
    email: 'member@example.test',
    role: 'member',
    status: 'active',
    accessUntil: '2099-01-01T00:00:00.000Z',
  })
  mocks.createServerGuards.mockReturnValue({ requireUser: mocks.requireUser })
  mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 10 })
  mocks.from.mockImplementation(queryFor)
  mocks.rpc.mockResolvedValue({ data: { removed: false, reaction: { id: RESOURCE_ID } }, error: null })
  mocks.adminRpc.mockResolvedValue({ data: { removed: false, reaction: { id: RESOURCE_ID } }, error: null })
  mocks.createAdminClient.mockReturnValue({ rpc: mocks.adminRpc })
})

describe('canonical community authorization', () => {
  const handlers = [
    ['posts GET', () => getPosts(request('/api/community/posts'))],
    ['posts POST', () => createPost(request('/api/community/posts', 'POST', { content: 'Post', category: 'geral' }))],
    ['posts PUT', () => updatePost(request('/api/community/posts', 'PUT', { id: RESOURCE_ID, content: 'Post' }))],
    ['posts DELETE', () => deletePost(request(`/api/community/posts?id=${RESOURCE_ID}`, 'DELETE'))],
    ['comments GET', () => getComments(request(`/api/community/comments?post_id=${RESOURCE_ID}`))],
    ['comments POST', () => createComment(request('/api/community/comments', 'POST', { post_id: RESOURCE_ID, content: 'Comment' }))],
    ['comments PUT', () => updateComment(request('/api/community/comments', 'PUT', { id: RESOURCE_ID, content: 'Comment' }))],
    ['comments DELETE', () => deleteComment(request(`/api/community/comments?id=${RESOURCE_ID}`, 'DELETE'))],
    ['reactions GET', () => getReactions(request(`/api/community/reactions?post_id=${RESOURCE_ID}`))],
    ['reactions POST', () => toggleReaction(request('/api/community/reactions', 'POST', { post_id: RESOURCE_ID, reaction_type: 'like', operation_id: OPERATION_ID }))],
    ['chat GET', () => getChat(request('/api/community/chat'))],
    ['chat POST', () => createMessage(request('/api/community/chat', 'POST', { channel_id: RESOURCE_ID, content: 'Message' }))],
    ['chat PUT', () => updateMessage(request('/api/community/chat', 'PUT', { id: RESOURCE_ID, content: 'Message' }))],
    ['chat DELETE', () => deleteMessage(request(`/api/community/chat?id=${RESOURCE_ID}`, 'DELETE'))],
  ] as const

  const authorizationFailures = [
    [401, 'Unauthorized'],
    [403, 'Forbidden'],
    [503, 'Service unavailable'],
  ] as const

  it.each(handlers.flatMap(([name, invoke]) => authorizationFailures.map(
    ([status, message]) => [name, status, message, invoke] as const,
  )))('rejects %s with generic %s authorization handling', async (_name, status, message, invoke) => {
    mocks.requireUser.mockRejectedValue({ status, message: 'sensitive detail' })

    const response = await invoke()

    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual({ error: message })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.adminRpc).not.toHaveBeenCalled()
  })

  it('passes auth lookup failures into the canonical guard', async () => {
    const user = { id: MEMBER_ID, email: 'member@example.test' }
    const authError = { message: 'upstream detail' }
    mocks.getUser.mockResolvedValue({ data: { user }, error: authError })

    await getPosts(request('/api/community/posts'))

    expect(mocks.createServerGuards).toHaveBeenCalledWith(user, authError)
  })

  it('keys rate limiting with the authorized user rather than an untrusted body or header identity', async () => {
    await createPost(request('/api/community/posts', 'POST', {
      content: 'Post',
      category: 'geral',
      user_id: '00000000-0000-4000-8000-000000000099',
    }))

    expect(mocks.checkRateLimit).toHaveBeenCalledWith(`posts-post-${MEMBER_ID}`, 10, 60000)
  })
})

describe('strict community input validation', () => {
  it.each([
    ['posts pagination', () => getPosts(request('/api/community/posts?page=1.5'))],
    ['posts extreme page', () => getPosts(request('/api/community/posts?page=9007199254740992'))],
    ['posts limit', () => getPosts(request('/api/community/posts?limit=101'))],
    ['posts category', () => getPosts(request('/api/community/posts?category=private'))],
    ['posts unknown query', () => getPosts(request('/api/community/posts?debug=true'))],
    ['comments UUID', () => getComments(request('/api/community/comments?post_id=bad'))],
    ['comments unknown query', () => getComments(request(`/api/community/comments?post_id=${RESOURCE_ID}&debug=true`))],
    ['reactions UUID', () => getReactions(request('/api/community/reactions?post_id=bad'))],
    ['chat pagination', () => getChat(request(`/api/community/chat?channel_id=${RESOURCE_ID}&page=zero`))],
    ['chat extreme page', () => getChat(request(`/api/community/chat?channel_id=${RESOURCE_ID}&page=9007199254740992`))],
    ['chat unknown query', () => getChat(request('/api/community/chat?debug=true'))],
  ])('rejects invalid %s before reading data', async (_case, invoke) => {
    const response = await invoke()

    expect(response.status).toBe(400)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it.each([
    ['post unknown fields', createPost, { content: 'Post', category: 'geral', user_id: MEMBER_ID }],
    ['post non-string content', createPost, { content: 123, category: 'geral' }],
    ['post category', createPost, { content: 'Post', category: 'private' }],
    ['post URL', createPost, { content: 'Post', category: 'geral', image_url: 'javascript:alert(1)' }],
    ['post HTTP URL', createPost, { content: 'Post', category: 'geral', image_url: 'http://images.example.test/post.png' }],
    ['post padded URL', createPost, { content: 'Post', category: 'geral', image_url: ' https://images.example.test/post.png ' }],
    ['post interior-space URL', createPost, { content: 'Post', category: 'geral', image_url: 'https://images.example.test/post image.png' }],
    ['post newline URL', createPost, { content: 'Post', category: 'geral', image_url: 'https://images.example.test/image.png\n' }],
    ['post URL length', createPost, { content: 'Post', category: 'geral', image_url: `https://images.example.test/${'x'.repeat(2049)}` }],
    ['post malformed URL', createPost, { content: 'Post', category: 'geral', image_url: 'not a url' }],
    ['post malformed colon host', createPost, { content: 'Post', category: 'geral', image_url: 'https://:' }],
    ['post malformed percent host', createPost, { content: 'Post', category: 'geral', image_url: 'https://%' }],
    ['post credential URL', createPost, { content: 'Post', category: 'geral', image_url: 'https://user@example.test/image.png' }],
    ['post port URL', createPost, { content: 'Post', category: 'geral', image_url: 'https://example.test:443/image.png' }],
    ['post single-label host', createPost, { content: 'Post', category: 'geral', image_url: 'https://localhost/image.png' }],
    ['post uppercase scheme', createPost, { content: 'Post', category: 'geral', image_url: 'HTTPS://images.example.test/image.png' }],
    ['post raw length', createPost, { content: ` ${'p'.repeat(5000)} `, category: 'geral' }],
    ['comment UUID', createComment, { post_id: 'bad', content: 'Comment' }],
    ['comment parent UUID', createComment, { post_id: RESOURCE_ID, parent_comment_id: 'bad', content: 'Comment' }],
    ['comment unknown fields', createComment, { post_id: RESOURCE_ID, content: 'Comment', user_id: MEMBER_ID }],
    ['comment raw length', createComment, { post_id: RESOURCE_ID, content: ` ${'c'.repeat(2000)} ` }],
    ['reaction type', toggleReaction, { post_id: RESOURCE_ID, reaction_type: 'angry', operation_id: OPERATION_ID }],
    ['reaction operation UUID', toggleReaction, { post_id: RESOURCE_ID, reaction_type: 'like', operation_id: 'bad' }],
    ['reaction missing operation UUID', toggleReaction, { post_id: RESOURCE_ID, reaction_type: 'like' }],
    ['reaction unknown fields', toggleReaction, { post_id: RESOURCE_ID, reaction_type: 'like', operation_id: OPERATION_ID, user_id: MEMBER_ID }],
    ['reaction actor injection', toggleReaction, { post_id: RESOURCE_ID, reaction_type: 'like', operation_id: OPERATION_ID, actor_id: MEMBER_ID }],
    ['message UUID', createMessage, { channel_id: 'bad', content: 'Message' }],
    ['message unknown fields', createMessage, { channel_id: RESOURCE_ID, content: 'Message', user_id: MEMBER_ID }],
    ['message raw length', createMessage, { channel_id: RESOURCE_ID, content: ` ${'m'.repeat(1000)} ` }],
  ])('rejects invalid %s before writing', async (_case, handler, body) => {
    const response = await handler(request('/api/community/resource', 'POST', body))

    expect(response.status).toBe(400)
    expect(queryCalls.some((call) => ['insert', 'update', 'delete'].includes(call.method))).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.adminRpc).not.toHaveBeenCalled()
  })

  it.each([
    ['post create', createPost, 'POST'],
    ['post update', updatePost, 'PUT'],
    ['comment create', createComment, 'POST'],
    ['comment update', updateComment, 'PUT'],
    ['reaction toggle', toggleReaction, 'POST'],
    ['message create', createMessage, 'POST'],
    ['message update', updateMessage, 'PUT'],
  ])('rejects malformed raw JSON for %s without writing', async (_case, handler, method) => {
    const response = await handler(rawRequest('/api/community/resource', method, '{'))

    expect(response.status).toBe(400)
    expect(queryCalls.some((call) => ['insert', 'update', 'delete'].includes(call.method))).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.adminRpc).not.toHaveBeenCalled()
  })

  it.each([
    ['post update', updatePost, { id: RESOURCE_ID, content: '' }],
    ['comment update', updateComment, { id: RESOURCE_ID, content: 123 }],
    ['message update', updateMessage, { id: 'bad', content: 'Message' }],
  ])('rejects invalid %s bodies', async (_case, handler, body) => {
    const response = await handler(request('/api/community/resource', 'PUT', body))

    expect(response.status).toBe(400)
  })

  it.each([
    ['post delete', deletePost, '/api/community/posts?id=bad'],
    ['comment delete', deleteComment, '/api/community/comments?id=bad'],
    ['message delete', deleteMessage, '/api/community/chat?id=bad'],
  ])('rejects malformed UUIDs for %s', async (_case, handler, path) => {
    const response = await handler(request(path, 'DELETE'))

    expect(response.status).toBe(400)
  })
})

describe('community data boundaries', () => {
  it('uses only canonical public profiles for every community author response', async () => {
    tableResults.set('community_posts', { data: [{ user_id: MEMBER_ID }], error: null })
    tableResults.set('community_comments', { data: [{ user_id: MEMBER_ID }], error: null })
    await getPosts(request('/api/community/posts'))
    await getComments(request(`/api/community/comments?post_id=${RESOURCE_ID}`))
    await getReactions(request(`/api/community/reactions?post_id=${RESOURCE_ID}`))
    await getChat(request('/api/community/chat'))
    tableResults.set('chat_messages', { data: [{ user_id: MEMBER_ID }], error: null })
    await getChat(request(`/api/community/chat?channel_id=${RESOURCE_ID}`))

    const selections = queryCalls.filter((call) => call.method === 'select')
    expect(selections.length).toBeGreaterThan(0)
    expect(selections.every((call) => typeof call.args[0] === 'string' && !call.args[0].includes('*'))).toBe(true)
    expect(selections.filter((call) => call.table === 'community_profiles').every(
      (call) => call.args[0] === 'id, full_name, avatar_url',
    )).toBe(true)
    expect(selections.filter((call) => call.table === 'community_profiles')).toHaveLength(3)
    expect(queryCalls.some((call) => call.table === 'profiles')).toBe(false)
  })

  it('strips unexpected private profile fields from community responses', async () => {
    tableResults.set('community_posts', { data: [{ id: RESOURCE_ID, user_id: MEMBER_ID }], error: null })
    tableResults.set('community_profiles', {
      data: [{
        id: MEMBER_ID,
        full_name: 'Member',
        avatar_url: 'https://images.example.test/member.png',
        email: 'private@example.test',
        phone: '+55 11 99999-9999',
        role: 'admin',
        is_banned: true,
      }],
      error: null,
    })

    const response = await getPosts(request('/api/community/posts'))
    const body = await response.json()

    expect(body.posts[0].profiles).toEqual({
      full_name: 'Member',
      avatar_url: 'https://images.example.test/member.png',
    })
  })

  it.each([
    ['post update', updatePost, 'community_posts', 'PUT', { id: RESOURCE_ID, content: 'Updated' }],
    ['comment update', updateComment, 'community_comments', 'PUT', { id: RESOURCE_ID, content: 'Updated' }],
    ['message update', updateMessage, 'chat_messages', 'PUT', { id: RESOURCE_ID, content: 'Updated' }],
  ])('returns 404 when %s changes no owned row', async (_case, handler, table, method, body) => {
    singleResults.set(table, { data: null, error: null })

    const response = await handler(request('/api/community/resource', method, body))

    expect(response.status).toBe(404)
  })

  it.each([
    ['post delete', deletePost, 'community_posts', `/api/community/posts?id=${RESOURCE_ID}`],
    ['comment delete', deleteComment, 'community_comments', `/api/community/comments?id=${RESOURCE_ID}`],
    ['message delete', deleteMessage, 'chat_messages', `/api/community/chat?id=${RESOURCE_ID}`],
  ])('returns 404 when %s removes no owned row', async (_case, handler, table, path) => {
    singleResults.set(table, { data: null, error: null })

    const response = await handler(request(path, 'DELETE'))

    expect(response.status).toBe(404)
  })

  it('derives inserted post ownership from the authorized session', async () => {
    singleResults.set('community_posts', { data: { id: RESOURCE_ID }, error: null })

    const response = await createPost(request('/api/community/posts', 'POST', {
      content: '  <b>Post</b>  ',
      category: 'geral',
      image_url: 'https://images.example.test/post.png',
    }))

    expect(response.status).toBe(201)
    expect(findCall('community_posts', 'insert')?.args[0]).toEqual({
      user_id: MEMBER_ID,
      content: 'Post',
      category: 'geral',
      image_url: 'https://images.example.test/post.png',
    })
  })
})

describe('atomic reaction toggle', () => {
  it('uses the trusted service RPC with only the server-derived actor identity', async () => {
    const response = await toggleReaction(request('/api/community/reactions', 'POST', {
      post_id: RESOURCE_ID,
      reaction_type: 'love',
      operation_id: OPERATION_ID,
    }))

    expect(response.status).toBe(201)
    expect(mocks.adminRpc).toHaveBeenCalledWith('toggle_community_reaction', {
      p_actor_id: MEMBER_ID,
      p_post_id: RESOURCE_ID,
      p_reaction_type: 'love',
      p_operation_id: OPERATION_ID,
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalledWith('community_reactions')
  })

  it('returns the removed result from the atomic operation', async () => {
    mocks.adminRpc.mockResolvedValue({ data: { removed: true, reaction: null }, error: null })

    const response = await toggleReaction(request('/api/community/reactions', 'POST', {
      post_id: RESOURCE_ID,
      reaction_type: 'like',
      operation_id: OPERATION_ID,
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ removed: true })
  })

  it('keeps database errors generic', async () => {
    mocks.adminRpc.mockResolvedValue({ data: null, error: { message: 'sensitive database detail' } })

    const response = await toggleReaction(request('/api/community/reactions', 'POST', {
      post_id: RESOURCE_ID,
      reaction_type: 'like',
      operation_id: OPERATION_ID,
    }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to toggle reaction' })
  })
})
