-- Preserve previously shared 12-character codes when an activity is upgraded.
-- Separate lengths keep the old and new code namespaces disjoint.
alter table public.class_sessions add column legacy_class_code text unique
  check (legacy_class_code ~ '^[A-F0-9]{12}$');
alter table public.class_sessions add constraint class_sessions_code_format
  check (class_code ~ '^[A-HJKMNP-Z2-9]{6}$' or class_code ~ '^[A-F0-9]{12}$');
-- RLS and revoked browser privileges on class_sessions remain in effect.
-- Existing codes are upgraded only after the compatible Edge Function is live.
