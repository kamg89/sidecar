-- Encrypted configuration for a revocable, seven-day test instructor workspace.
create or replace function public.classroom_server_config()
returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(name,decrypted_secret),'{}'::jsonb)
 from vault.decrypted_secrets where name in
 ('OPENAI_API_KEY','OPENAI_MODEL','INSTRUCTOR_KEY_SHA256','SCHEDULER_SECRET',
  'TEST_INSTRUCTOR_CODE_SHA256','TEST_INSTRUCTOR_TOKEN','TEST_INSTRUCTOR_EXPIRES_AT');
$$;
revoke all on function public.classroom_server_config() from public,anon,authenticated;
grant execute on function public.classroom_server_config() to service_role;

create function public.classroom_save_test_access(p_code_hash text,p_token text,p_expires text)
returns void language plpgsql security definer set search_path='' as $$
declare k text;v text;sid uuid;
begin
 if p_code_hash<>'' and p_code_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid access hash';end if;
 if p_token<>'' and p_token !~ '^w_[a-f0-9]{64}$' then raise exception 'Invalid access token';end if;
 if p_expires<>'' then perform p_expires::timestamptz;end if;
 for k,v in select * from (values ('TEST_INSTRUCTOR_CODE_SHA256',p_code_hash),('TEST_INSTRUCTOR_TOKEN',p_token),('TEST_INSTRUCTOR_EXPIRES_AT',p_expires)) as values_to_save(name,value)
 loop
  select id into sid from vault.secrets where name=k;
  if sid is null then perform vault.create_secret(v,k,'Sidecar test instructor access');
  else perform vault.update_secret(sid,v);end if;
 end loop;
end;
$$;
revoke all on function public.classroom_save_test_access(text,text,text) from public,anon,authenticated;
grant execute on function public.classroom_save_test_access(text,text,text) to service_role;

create function public.classroom_instructor_login_limit(p_bucket text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare used integer;
begin
 delete from public.class_join_limits where expires_at<now();
 insert into public.class_join_limits(bucket) values(p_bucket)
 on conflict(bucket) do update set attempts=public.class_join_limits.attempts+1 returning attempts into used;
 return used<=12;
end;
$$;
revoke all on function public.classroom_instructor_login_limit(text) from public,anon,authenticated;
grant execute on function public.classroom_instructor_login_limit(text) to service_role;
