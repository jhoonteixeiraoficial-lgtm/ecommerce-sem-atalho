drop function public.toggle_community_reaction(uuid, text);

alter table public.community_posts
  drop constraint community_posts_image_url_check,
  add constraint community_posts_image_url_check
    check (
      image_url is not null
      and pg_catalog.char_length(image_url) <= 2048
      and (
        image_url = ''
        or (
          image_url ~ '^https://[^/[:space:]?#]+'
          and image_url !~ '[[:space:]]'
        )
      )
    )
    not valid;

create table public.community_reaction_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'love', 'fire', 'clap')),
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

create index community_reaction_operations_post_id_idx
  on public.community_reaction_operations(post_id);

alter table public.community_reaction_operations enable row level security;
revoke all on table public.community_reaction_operations
  from public, anon, authenticated, service_role;

create function public.toggle_community_reaction(
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
  caller_id uuid := auth.uid();
  existing_operation public.community_reaction_operations;
  existing_reaction public.community_reactions;
  inserted_reaction public.community_reactions;
  operation_result jsonb;
begin
  if caller_id is null
    or p_post_id is null
    or p_reaction_type is null
    or p_operation_id is null
    or p_reaction_type not in ('like', 'love', 'fire', 'clap')
    or not public.has_member_access()
  then
    raise exception using errcode = 'P0001', message = 'Community reaction rejected';
  end if;

  insert into public.community_reaction_operations (
    user_id,
    operation_id,
    post_id,
    reaction_type
  ) values (
    caller_id,
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
    where operations.user_id = caller_id
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
      caller_id::text || ':' || p_post_id::text || ':' || p_reaction_type,
      0
    )
  );

  select reactions.*
  into existing_reaction
  from public.community_reactions as reactions
  where reactions.post_id = p_post_id
    and reactions.user_id = caller_id
    and reactions.reaction_type = p_reaction_type;

  if found then
    delete from public.community_reactions
    where id = existing_reaction.id;

    operation_result := pg_catalog.jsonb_build_object('removed', true, 'reaction', null);
  else
    insert into public.community_reactions (post_id, user_id, reaction_type)
    values (p_post_id, caller_id, p_reaction_type)
    returning * into inserted_reaction;

    operation_result := pg_catalog.jsonb_build_object(
      'removed', false,
      'reaction', pg_catalog.to_jsonb(inserted_reaction)
    );
  end if;

  update public.community_reaction_operations
  set result = operation_result
  where user_id = caller_id
    and operation_id = p_operation_id;

  return operation_result;
exception
  when foreign_key_violation or check_violation or not_null_violation then
    raise exception using errcode = 'P0001', message = 'Community reaction rejected';
end;
$$;

alter function public.toggle_community_reaction(uuid, text, uuid) owner to postgres;
revoke all on function public.toggle_community_reaction(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.toggle_community_reaction(uuid, text, uuid)
  to authenticated;
