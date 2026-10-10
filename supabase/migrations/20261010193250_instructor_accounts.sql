-- Existing master/sample activities remain unowned; new accounts are isolated.
alter table public.class_sessions add column owner_user_id uuid references auth.users(id) on delete cascade;
create index class_sessions_owner_created_idx on public.class_sessions(owner_user_id, created_at desc);

create table public.instructor_sessions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null
);
create index instructor_sessions_owner_idx on public.instructor_sessions(owner_id);
create index instructor_sessions_expiry_idx on public.instructor_sessions(expires_at);
alter table public.instructor_sessions enable row level security;
revoke all on public.instructor_sessions from public,anon,authenticated;
grant all on public.instructor_sessions to service_role;
