alter table public.slide_blocks add column contributor text not null default '' check (length(contributor) <= 120);
alter table public.class_sessions add column is_test boolean not null default false;
alter table public.class_sessions add column tester_key_hash text unique;
alter table public.class_sessions add column tester_expires_at timestamptz;
alter table public.class_sessions add column ai_runs integer not null default 0;

-- Preserve the job and its Vault-backed authentication; update only its cadence.
select cron.alter_job(job_id := jobid, schedule := '* * * * *')
from cron.job where jobname = 'sidecar-debrief-every-two-minutes';
