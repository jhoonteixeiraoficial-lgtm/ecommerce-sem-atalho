alter table public.community_posts
  add constraint community_posts_image_url_check
    check (
      image_url is not null
      and pg_catalog.char_length(image_url) <= 2048
      and (
        image_url = ''
        or (
          image_url ~* '^https?://[^/[:space:]?#]+'
          and image_url !~ '[[:space:]]'
        )
      )
    )
    not valid;

create or replace function public.toggle_community_reaction(
  p_post_id uuid,
  p_reaction_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  existing_reaction public.community_reactions;
  inserted_reaction public.community_reactions;
begin
  if caller_id is null
    or p_post_id is null
    or p_reaction_type is null
    or p_reaction_type not in ('like', 'love', 'fire', 'clap')
    or not public.has_member_access()
  then
    raise exception using errcode = 'P0001', message = 'Community reaction rejected';
  end if;

  -- Serialize only toggles for this member/post/reaction tuple. The existing
  -- unique constraint remains the final duplicate-write boundary.
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

    return pg_catalog.jsonb_build_object('removed', true, 'reaction', null);
  end if;

  insert into public.community_reactions (post_id, user_id, reaction_type)
  values (p_post_id, caller_id, p_reaction_type)
  returning * into inserted_reaction;

  return pg_catalog.jsonb_build_object(
    'removed', false,
    'reaction', pg_catalog.to_jsonb(inserted_reaction)
  );
exception
  when foreign_key_violation or check_violation then
    raise exception using errcode = 'P0001', message = 'Community reaction rejected';
end;
$$;

alter function public.toggle_community_reaction(uuid, text) owner to postgres;
revoke all on function public.toggle_community_reaction(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.toggle_community_reaction(uuid, text)
  to authenticated;
