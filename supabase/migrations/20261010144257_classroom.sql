create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 160),
  instructions text not null default '',
  status text not null default 'draft' check (status in ('draft','live','paused','ended')),
  ends_at timestamptz,
  focus text not null default 'Compare ideas and surface productive disagreements',
  debrief_prompt text not null default '',
  slide_count int not null default 4 check (slide_count between 1 and 6),
  auto_debrief boolean not null default true,
  debrief jsonb,
  debrief_at timestamptz,
  debrief_lock_until timestamptz,
  last_attempt_at timestamptz,
  input_hash text,
  ai_error text,
  created_at timestamptz not null default now()
);
create table public.class_groups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  join_token text not null unique,
  token_hash text not null unique,
  position int not null,
  created_at timestamptz not null default now()
);
create index class_groups_session_idx on public.class_groups(session_id);
create table public.class_slides (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.class_groups(id) on delete cascade,
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  position int not null default 0,
  title text not null default 'Our thinking',
  revision int not null default 0,
  theme text not null default 'paper' check (theme in ('paper','midnight','sage')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index class_slides_group_idx on public.class_slides(group_id);
create index class_slides_session_idx on public.class_slides(session_id);
create table public.slide_blocks (
  id uuid primary key default gen_random_uuid(),
  slide_id uuid not null references public.class_slides(id) on delete cascade,
  position int not null default 0,
  label text not null default '',
  content text not null default '' check (length(content) <= 6000),
  style jsonb not null default '{}',
  revision int not null default 0,
  updated_at timestamptz not null default now()
);
create index slide_blocks_slide_idx on public.slide_blocks(slide_id);
create table public.debrief_history (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  content jsonb not null,
  input_hash text not null,
  created_at timestamptz not null default now()
);
create index debrief_history_session_idx on public.debrief_history(session_id, created_at desc);
alter table public.class_sessions enable row level security;
alter table public.class_groups enable row level security;
alter table public.class_slides enable row level security;
alter table public.slide_blocks enable row level security;
alter table public.debrief_history enable row level security;
-- No browser has direct table privileges. The Edge Function enforces instructor/group access.
revoke all on public.class_sessions, public.class_groups, public.class_slides, public.slide_blocks, public.debrief_history from anon, authenticated;
grant all on public.class_sessions, public.class_groups, public.class_slides, public.slide_blocks, public.debrief_history to service_role;

-- Server configuration is encrypted at rest in Vault. Only the Edge service role
-- can invoke this zero-argument accessor; browser roles cannot access it.
create extension if not exists supabase_vault with schema vault;
create or replace function public.classroom_server_config()
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets
  where name in ('OPENAI_API_KEY','OPENAI_MODEL','INSTRUCTOR_KEY_SHA256','SCHEDULER_SECRET');
$$;
revoke all on function public.classroom_server_config() from public, anon, authenticated;
grant execute on function public.classroom_server_config() to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
-- The URL and scheduler key are installed as Vault secrets during deployment.
-- No credentials are embedded in the migration or cron command.
select cron.schedule('sidecar-debrief-every-two-minutes', '*/2 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'CLASSROOM_FUNCTION_URL'),
    headers := jsonb_build_object('Content-Type','application/json','x-classroom-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'SCHEDULER_SECRET')),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 180000
  ) where exists (select 1 from public.class_sessions where status='live' and auto_debrief and ends_at > now());
$$);
