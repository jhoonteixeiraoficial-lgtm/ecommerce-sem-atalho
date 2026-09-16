import type { AccountState, AppRole } from './types'

interface AuthorizationClient {
  from(table: string): unknown
}

interface AuthorizationQuery {
  select(columns: string): AuthorizationQuery
  eq(column: string, value: string): AuthorizationQuery
  not(column: string, operator: string, value: null): AuthorizationQuery
  order(column: string, options: { ascending: boolean }): AuthorizationQuery
  limit(count: number): AuthorizationQuery
  single(): Promise<{ data: Record<string, unknown> | null; error: unknown }>
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>
}

// Supabase may transiently reject a freshly issued gateway JWT because of
// clock skew. Retry only that explicit error, never bypass authorization.
async function queryAuthorization<T extends { error: unknown }>(query: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const result = await query()
    const error = result.error as { code?: unknown; message?: unknown } | null
    if (attempt >= 2 || error?.code !== 'PGRST303' || error.message !== 'JWT issued at future') {
      return result
    }
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
  }
}

export async function loadAuthorization(client: AuthorizationClient, userId: string) {
  const [roleResult, statusResult, subscriptionResult] = await Promise.all([
    queryAuthorization(() => (client.from('user_roles') as AuthorizationQuery)
      .select('role').eq('user_id', userId).single()),
    queryAuthorization(() => (client.from('account_status') as AuthorizationQuery)
      .select('status').eq('user_id', userId).single()),
    queryAuthorization(() => (client.from('subscriptions') as AuthorizationQuery)
      .select('current_period_end')
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('current_period_end', 'is', null)
      .order('current_period_end', { ascending: false })
      .limit(1)
      .maybeSingle()),
  ])

  if (
    roleResult.error ||
    statusResult.error ||
    subscriptionResult.error ||
    !roleResult.data ||
    !statusResult.data
  ) {
    console.error('[auth] loadAuthorization failed:', {
      roleError: roleResult.error,
      statusError: statusResult.error,
      subscriptionError: subscriptionResult.error,
      roleData: roleResult.data,
      statusData: statusResult.data,
    })
    throw new Error('Authorization service unavailable')
  }

  return {
    role: roleResult.data.role as AppRole,
    status: statusResult.data.status as AccountState,
    accessUntil: (subscriptionResult.data?.current_period_end as string | undefined) ?? null,
  }
}
