alter table public.class_sessions add column work_mode text not null default 'group' check(work_mode in ('group','individual'));
alter table public.class_sessions add column class_code text unique;
alter table public.class_sessions add column join_enabled boolean not null default true;
-- Give existing activities the same entry flow; no classroom content is changed.
update public.class_sessions set class_code=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)) where class_code is null;
alter table public.class_groups add column claimant_hash text;
create unique index class_groups_claimant_idx on public.class_groups(session_id,claimant_hash) where claimant_hash is not null;

-- These are fixed-purpose server-only RPCs, never browser-accessible.
create function public.classroom_save_ai_config(p_model text,p_api_key text default null)
returns void language plpgsql security definer set search_path='' as $$
declare secret_id uuid;
begin
  if length(p_model)>100 or p_model !~ '^gpt-[A-Za-z0-9._-]+$' then raise exception 'Invalid model'; end if;
  if p_api_key is not null then
    if length(p_api_key)<20 or length(p_api_key)>512 or p_api_key !~ '^sk-' then raise exception 'Invalid key'; end if;
    select id into secret_id from vault.secrets where name='OPENAI_API_KEY';
    if secret_id is null then perform vault.create_secret(p_api_key,'OPENAI_API_KEY');
    else perform vault.update_secret(secret_id,p_api_key); end if;
  end if;
  select id into secret_id from vault.secrets where name='OPENAI_MODEL';
  if secret_id is null then perform vault.create_secret(p_model,'OPENAI_MODEL');
  else perform vault.update_secret(secret_id,p_model); end if;
end;
$$;
revoke all on function public.classroom_save_ai_config(text,text) from public,anon,authenticated;
grant execute on function public.classroom_save_ai_config(text,text) to service_role;

create function public.classroom_claim_individual(p_session uuid,p_resume_hash text,p_name text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare activity public.class_sessions%rowtype; seat public.class_groups%rowtype;
begin
  select * into activity from public.class_sessions where id=p_session for update;
  if not found or activity.work_mode<>'individual' or not activity.join_enabled or activity.status='ended' then return null; end if;
  if p_resume_hash !~ '^[a-f0-9]{64}$' or length(p_name) not between 1 and 60 then return null; end if;
  select * into seat from public.class_groups where session_id=p_session and claimant_hash=p_resume_hash;
  if not found then
    select * into seat from public.class_groups where session_id=p_session and claimant_hash is null order by position limit 1 for update;
    if not found then return null; end if;
    update public.class_groups set claimant_hash=p_resume_hash,name=p_name where id=seat.id;
    update public.class_slides set title=p_name||' · My reflection' where group_id=seat.id and title=seat.name||' · Our reflection';
    update public.slide_blocks set contributor=p_name where slide_id in (select id from public.class_slides where group_id=seat.id) and contributor='' and content='';
  end if;
  return jsonb_build_object('token',seat.join_token,'groupId',seat.id);
end;
$$;
revoke all on function public.classroom_claim_individual(uuid,text,text) from public,anon,authenticated;
grant execute on function public.classroom_claim_individual(uuid,text,text) to service_role;

create table public.class_join_limits(bucket text primary key,attempts integer not null default 1,expires_at timestamptz not null default now()+interval '1 hour');
create index class_join_limits_expiry_idx on public.class_join_limits(expires_at);
alter table public.class_join_limits enable row level security;
revoke all on public.class_join_limits from public,anon,authenticated;
grant all on public.class_join_limits to service_role;
create function public.classroom_join_limit(p_bucket text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare used integer;
begin
 delete from public.class_join_limits where expires_at<now();
 insert into public.class_join_limits(bucket) values(p_bucket) on conflict(bucket) do update set attempts=public.class_join_limits.attempts+1 returning attempts into used;
 return used<=180;
end;
$$;
revoke all on function public.classroom_join_limit(text) from public,anon,authenticated;
grant execute on function public.classroom_join_limit(text) to service_role;
