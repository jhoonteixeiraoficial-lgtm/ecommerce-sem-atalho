create or replace function public.admin_user_action(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_role public.app_role,
  p_status public.account_state,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_is_active_admin boolean;
  target_role public.app_role;
  target_status public.account_state;
  normalized_reason text;
  audit_action text;
  audit_metadata jsonb;
begin
  -- Every admin mutation uses the same transaction-scoped lock so invariant
  -- checks are re-evaluated after any competing action commits.
  perform pg_catalog.pg_advisory_xact_lock(194964823, 1);

  select true
  into actor_is_active_admin
  from public.user_roles as roles
  join public.account_status as states using (user_id)
  where roles.user_id = p_actor_user_id
    and roles.role = 'admin'::public.app_role
    and states.status = 'active'::public.account_state;

  if not coalesce(actor_is_active_admin, false) then
    raise exception using errcode = 'P0001', message = 'Admin user action rejected';
  end if;

  select roles.role, states.status
  into target_role, target_status
  from public.user_roles as roles
  join public.account_status as states using (user_id)
  where roles.user_id = p_target_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'Admin user action rejected';
  end if;

  if p_action = 'set_role' then
    if p_role is null or p_status is not null or p_reason is not null then
      raise exception using errcode = 'P0001', message = 'Admin user action rejected';
    end if;

    if p_actor_user_id = p_target_user_id and p_role = 'member'::public.app_role then
      raise exception using errcode = 'P0001', message = 'Admin user action rejected';
    end if;

    if target_role = 'admin'::public.app_role
      and target_status = 'active'::public.account_state
      and p_role = 'member'::public.app_role
      and (
        select count(*)
        from public.user_roles as roles
        join public.account_status as states using (user_id)
        where roles.role = 'admin'::public.app_role
          and states.status = 'active'::public.account_state
      ) <= 1
    then
      raise exception using errcode = 'P0001', message = 'Admin user action rejected';
    end if;

    update public.user_roles
    set role = p_role,
        updated_at = pg_catalog.statement_timestamp()
    where user_id = p_target_user_id;

    audit_action := 'user.role_changed';
    audit_metadata := pg_catalog.jsonb_build_object(
      'previous_role', target_role,
      'new_role', p_role
    );
  elsif p_action = 'set_status' then
    if p_status is null or p_role is not null then
      raise exception using errcode = 'P0001', message = 'Admin user action rejected';
    end if;

    if p_actor_user_id = p_target_user_id
      and p_status in ('suspended'::public.account_state, 'banned'::public.account_state)
    then
      raise exception using errcode = 'P0001', message = 'Admin user action rejected';
    end if;

    normalized_reason := pg_catalog.btrim(coalesce(p_reason, ''));
    if p_status in ('suspended'::public.account_state, 'banned'::public.account_state)
      and pg_catalog.char_length(normalized_reason) not between 3 and 500
    then
      raise exception using errcode = 'P0001', message = 'Admin user action rejected';
    end if;

    if target_role = 'admin'::public.app_role
      and target_status = 'active'::public.account_state
      and p_status <> 'active'::public.account_state
      and (
        select count(*)
        from public.user_roles as roles
        join public.account_status as states using (user_id)
        where roles.role = 'admin'::public.app_role
          and states.status = 'active'::public.account_state
      ) <= 1
    then
      raise exception using errcode = 'P0001', message = 'Admin user action rejected';
    end if;

    if p_status = 'active'::public.account_state then
      normalized_reason := '';
    end if;

    update public.account_status
    set status = p_status,
        reason = normalized_reason,
        suspended_until = case
          when p_status = 'active'::public.account_state then null
          else suspended_until
        end,
        updated_at = pg_catalog.statement_timestamp()
    where user_id = p_target_user_id;

    audit_action := case p_status
      when 'suspended'::public.account_state then 'user.suspended'
      when 'banned'::public.account_state then 'user.banned'
      else 'user.reactivated'
    end;
    audit_metadata := pg_catalog.jsonb_build_object(
      'previous_status', target_status,
      'new_status', p_status,
      'reason', normalized_reason
    );
  else
    raise exception using errcode = 'P0001', message = 'Admin user action rejected';
  end if;

  insert into public.admin_audit_log (
    actor_user_id,
    action,
    target_user_id,
    metadata
  ) values (
    p_actor_user_id,
    audit_action,
    p_target_user_id,
    audit_metadata
  );
end;
$$;

revoke all on function public.admin_user_action(
  uuid,
  uuid,
  text,
  public.app_role,
  public.account_state,
  text
) from public, anon, authenticated;

grant execute on function public.admin_user_action(
  uuid,
  uuid,
  text,
  public.app_role,
  public.account_state,
  text
) to service_role;
