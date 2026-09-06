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

export async function loadAuthorization(client: AuthorizationClient, userId: string) {
  const roleQuery = client.from('user_roles') as AuthorizationQuery
  const statusQuery = client.from('account_status') as AuthorizationQuery
  const subscriptionQuery = client.from('subscriptions') as AuthorizationQuery

  const [roleResult, statusResult, subscriptionResult] = await Promise.all([
    roleQuery.select('role').eq('user_id', userId).single(),
    statusQuery.select('status').eq('user_id', userId).single(),
    subscriptionQuery
      .select('current_period_end')
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('current_period_end', 'is', null)
      .order('current_period_end', { ascending: false })
      .limit(1)
      .maybeSingle(),
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
