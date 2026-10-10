-- Existing activities keep their workspace default; new activities pin a choice.
alter table public.class_sessions add column ai_model text
  check (ai_model is null or (length(ai_model)<=100 and ai_model ~ '^gpt-[A-Za-z0-9._-]+$'));
comment on column public.class_sessions.ai_model is
  'Instructor-selected model for this activity. Null retains the workspace default for legacy activities.';
