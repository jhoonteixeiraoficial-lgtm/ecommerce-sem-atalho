-- Allows an active admin to manually grant or revoke a member's subscription
-- access. Mirrors the security posture of admin_user_action: advisory lock,
-- admin re-validation, and an audit trail entry per action.

create or replace function public.admin_manage_subscription(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_plan text default null,
  p_period_days integer default 365
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_is_active_admin boolean;
  existing_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(194964824, 1);

  select true
  into actor_is_active_admin
  from public.user_roles as roles
  join public.account_status as states using (user_id)
  where roles.user_id = p_actor_user_id
    and roles.role = 'admin'::public.app_role
    and states.status = 'active'::public.account_state;

  if not coalesce(actor_is_active_admin, false) then
    raise exception using errcode = 'P0001', message = 'Admin subscription action rejected';
  end if;

  if not exists (select 1 from public.user_roles where user_id = p_target_user_id) then
    raise exception using errcode = 'P0001', message = 'Admin subscription action rejected';
  end if;

  if p_action = 'grant' then
    if p_plan is null or p_plan not in ('comunidade', 'acertive', 'combo') then
      raise exception using errcode = 'P0001', message = 'Admin subscription action rejected';
    end if;

    if p_period_days is null or p_period_days <= 0 or p_period_days > 3650 then
      raise exception using errcode = 'P0001', message = 'Admin subscription action rejected';
    end if;

    select id
    into existing_id
    from public.subscriptions
    where user_id = p_target_user_id
    order by created_at desc
    limit 1;

    if existing_id is not null then
      update public.subscriptions
      set plan = p_plan,
          status = 'active',
          payment_provider = 'manual',
          current_period_start = pg_catalog.statement_timestamp(),
          current_period_end = pg_catalog.statement_timestamp() + make_interval(days => p_period_days),
          updated_at = pg_catalog.statement_timestamp()
      where id = existing_id;
    else
      insert into public.subscriptions (
        user_id, plan, status, payment_provider, current_period_start, current_period_end
      ) values (
        p_target_user_id, p_plan, 'active', 'manual',
        pg_catalog.statement_timestamp(), pg_catalog.statement_timestamp() + make_interval(days => p_period_days)
      );
    end if;

    insert into public.admin_audit_log (actor_user_id, action, target_user_id, metadata)
    values (
      p_actor_user_id,
      'subscription.granted',
      p_target_user_id,
      pg_catalog.jsonb_build_object('plan', p_plan, 'period_days', p_period_days)
    );
  elsif p_action = 'revoke' then
    update public.subscriptions
    set status = 'cancelled',
        current_period_end = pg_catalog.statement_timestamp(),
        updated_at = pg_catalog.statement_timestamp()
    where user_id = p_target_user_id
      and status = 'active';

    insert into public.admin_audit_log (actor_user_id, action, target_user_id, metadata)
    values (p_actor_user_id, 'subscription.revoked', p_target_user_id, '{}'::jsonb);
  else
    raise exception using errcode = 'P0001', message = 'Admin subscription action rejected';
  end if;
end;
$$;

revoke all on function public.admin_manage_subscription(
  uuid, uuid, text, text, integer
) from public, anon, authenticated;

grant execute on function public.admin_manage_subscription(
  uuid, uuid, text, text, integer
) to service_role;
