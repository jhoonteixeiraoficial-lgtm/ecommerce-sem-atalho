drop function public.toggle_community_reaction(uuid, text, uuid);

alter table public.community_posts
  drop constraint community_posts_image_url_check,
  add constraint community_posts_image_url_check
    check (
      image_url is not null
      and pg_catalog.char_length(image_url) <= 2048
      and (
        image_url = ''
        or image_url ~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(/[A-Za-z0-9._~!$&()*+,;=:@%/?#-]*)?$'
      )
    )
    not valid;

create index community_reaction_operations_created_at_idx
  on public.community_reaction_operations(created_at);

create function public.toggle_community_reaction(
  p_actor_id uuid,
  p_post_id uuid,
  p_reaction_type text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_operation public.community_reaction_operations;
  existing_reaction public.community_reactions;
  inserted_reaction public.community_reactions;
  operation_result jsonb;
begin
  if auth.role() is distinct from 'service_role'
    or p_actor_id is null
    or p_post_id is null
    or p_reaction_type is null
    or p_operation_id is null
    or p_reaction_type not in ('like', 'love', 'fire', 'clap')
    or not exists (
      select 1
      from public.user_roles as roles
      join public.account_status as states on states.user_id = roles.user_id
      where roles.user_id = p_actor_id
        and states.status = 'active'::public.account_state
        and (
          roles.role = 'admin'::public.app_role
          or exists (
            select 1
            from public.subscriptions as subscriptions
            where subscriptions.user_id = roles.user_id
              and subscriptions.status = 'active'::public.subscription_status
              and subscriptions.current_period_end is not null
              and subscriptions.current_period_end >= statement_timestamp()
          )
        )
    )
  then
    raise exception using errcode = 'P0001', message = 'Community reaction rejected';
  end if;

  delete from public.community_reaction_operations
  where created_at < statement_timestamp() - interval '15 minutes';

  insert into public.community_reaction_operations (
    user_id,
    operation_id,
    post_id,
    reaction_type
  ) values (
    p_actor_id,
    p_operation_id,
    p_post_id,
    p_reaction_type
  )
  on conflict (user_id, operation_id) do nothing
  returning * into existing_operation;

  if not found then
    select operations.*
    into existing_operation
    from public.community_reaction_operations as operations
    where operations.user_id = p_actor_id
      and operations.operation_id = p_operation_id;

    if not found
      or existing_operation.post_id <> p_post_id
      or existing_operation.reaction_type <> p_reaction_type
      or existing_operation.result is null
    then
      raise exception using errcode = 'P0001', message = 'Community reaction rejected';
    end if;

    return existing_operation.result;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor_id::text || ':' || p_post_id::text || ':' || p_reaction_type,
      0
    )
  );

  select reactions.*
  into existing_reaction
  from public.community_reactions as reactions
  where reactions.post_id = p_post_id
    and reactions.user_id = p_actor_id
    and reactions.reaction_type = p_reaction_type;

  if found then
    delete from public.community_reactions
    where id = existing_reaction.id;

    operation_result := pg_catalog.jsonb_build_object('removed', true, 'reaction', null);
  else
    insert into public.community_reactions (post_id, user_id, reaction_type)
    values (p_post_id, p_actor_id, p_reaction_type)
    returning * into inserted_reaction;

    operation_result := pg_catalog.jsonb_build_object(
      'removed', false,
      'reaction', pg_catalog.to_jsonb(inserted_reaction)
    );
  end if;

  update public.community_reaction_operations
  set result = operation_result
  where user_id = p_actor_id
    and operation_id = p_operation_id;

  return operation_result;
exception
  when foreign_key_violation or check_violation or not_null_violation then
    raise exception using errcode = 'P0001', message = 'Community reaction rejected';
end;
$$;

alter function public.toggle_community_reaction(uuid, uuid, text, uuid) owner to postgres;
revoke all on function public.toggle_community_reaction(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.toggle_community_reaction(uuid, uuid, text, uuid)
  to service_role;
