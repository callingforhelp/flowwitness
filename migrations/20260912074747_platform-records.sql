-- Trusted coordinator RPCs. No user/client may commit arbitrary snapshots.
-- Domain records are normalized into separately indexed rows; the revision row
-- serializes changes within one exact scope. Null is application scope only.
begin;
create table if not exists public.platform_scopes (
  application text not null,
  conversation_key text not null,
  conversation_id text,
  version bigint not null default 0,
  primary key (application, conversation_key),
  check (conversation_key = coalesce(to_jsonb(conversation_id)::text, 'null'))
);
create table if not exists public.platform_records (
  application text not null,
  conversation_key text not null,
  collection text not null,
  id text not null,
  record jsonb not null,
  primary key (application, conversation_key, collection, id),
  foreign key (application, conversation_key) references public.platform_scopes on delete cascade,
  check (record->>'application' = application),
  check (coalesce((record->'conversationId')::text, 'null') = conversation_key),
  check (record->>'id' = id),
  check ((record->>'version')::int > 0)
);
create index if not exists platform_records_order on public.platform_records(application, conversation_key, collection, (record->>'createdAt'), id);
create unique index if not exists platform_jobs_idempotency on public.platform_records(application, conversation_key, (record->>'kind'), (record->>'idempotencyKey')) where collection = 'investigationJobs';
create table if not exists public.platform_private_state (
  application text not null,
  conversation_key text not null,
  artifacts jsonb not null default '[]',
  links jsonb not null default '[]',
  primary key(application, conversation_key),
  foreign key(application, conversation_key) references public.platform_scopes on delete cascade
);
-- Scope membership is provisioned by operators, never self-service.
create table if not exists public.platform_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  application text not null,
  conversation_key text not null,
  role text not null check(role in ('operator','agent','customer')),
  primary key(user_id, application, conversation_key)
);
alter table public.platform_scopes enable row level security;
alter table public.platform_records enable row level security;
alter table public.platform_private_state enable row level security;
alter table public.platform_memberships enable row level security;
create policy platform_membership_read on public.platform_memberships for select to authenticated using(user_id = auth.uid());
create policy platform_record_read on public.platform_records for select to authenticated using (
  exists(select 1 from public.platform_memberships m where m.user_id = auth.uid()
    and m.application = platform_records.application and m.conversation_key = platform_records.conversation_key
    and m.role in ('operator','agent'))
);
-- Customer delivery uses the coordinator's domain authorization/publication gates.
revoke all on public.platform_scopes, public.platform_records, public.platform_private_state, public.platform_memberships from anon, authenticated;
grant select on public.platform_records, public.platform_memberships to authenticated;

create or replace function public.platform_load(p_application text, p_conversation text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare k text := coalesce(to_jsonb(p_conversation)::text, 'null'); v bigint; records jsonb; private_row public.platform_private_state;
begin
  if p_application is null or length(p_application) = 0 then raise exception 'Invalid scope'; end if;
  insert into public.platform_scopes(application,conversation_key,conversation_id) values(p_application,k,p_conversation) on conflict do nothing;
  -- Lock ensures records/private state and revision are one consistent snapshot.
  select version into v from public.platform_scopes where application=p_application and conversation_key=k for update;
  select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'record',record)), '[]') into records from public.platform_records where application=p_application and conversation_key=k;
  select * into private_row from public.platform_private_state where application=p_application and conversation_key=k;
  return jsonb_build_object('version',v,'now',clock_timestamp(),'state',jsonb_build_object('records',records,'artifacts',coalesce(private_row.artifacts,'[]'),'links',coalesce(private_row.links,'[]')));
end $$;

create or replace function public.platform_commit(p_application text, p_conversation text, p_version bigint, p_state jsonb)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare k text := coalesce(to_jsonb(p_conversation)::text, 'null'); v bigint; item jsonb; old_record jsonb; new_record jsonb; job_record jsonb; commit_time timestamptz := clock_timestamp();
begin
  select version into v from public.platform_scopes where application=p_application and conversation_key=k for update;
  if v is null or v <> p_version then return false; end if;
  if jsonb_typeof(p_state->'records') <> 'array' or jsonb_typeof(p_state->'artifacts') <> 'array' or jsonb_typeof(p_state->'links') <> 'array' then raise exception 'Invalid state'; end if;
  for item in select value from jsonb_array_elements(p_state->'records') loop
    if item->'record'->>'application' is distinct from p_application or coalesce((item->'record'->'conversationId')::text,'null') <> k then raise exception 'Scope mismatch'; end if;
    new_record := item->'record';
    if item->>'collection' = 'investigationJobs' then
      select record into old_record from public.platform_records where application=p_application and conversation_key=k and collection='investigationJobs' and id=new_record->>'id';
      if new_record is distinct from old_record then
        -- A lease that expired during an SDK round trip must not commit.
        if new_record->>'status' = 'leased' and ((new_record->'lease'->>'expiresAt')::timestamptz <= commit_time or (new_record->>'deadlineAt')::timestamptz <= commit_time) then return false; end if;
        if old_record->>'status' = 'leased' and (
          new_record->>'status' = 'succeeded' or
          (new_record->>'status' = 'failed' and new_record->>'errorCode' not in ('deadline_exceeded','attempts_exhausted')) or
          (new_record->>'status' = 'leased' and new_record->'lease'->>'token' = old_record->'lease'->>'token')
        ) and ((old_record->'lease'->>'expiresAt')::timestamptz <= commit_time or (old_record->>'deadlineAt')::timestamptz <= commit_time) then return false; end if;
      end if;
    end if;
  end loop;
  for item in select value from jsonb_array_elements((p_state->'artifacts') || (p_state->'links')) loop
    if item->>'application' is distinct from p_application or coalesce((item->'conversationId')::text,'null') <> k then raise exception 'Scope mismatch'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_state->'artifacts') loop
    if not exists(select 1 from public.platform_private_state p, jsonb_array_elements(p.artifacts) a where p.application=p_application and p.conversation_key=k and a->>'id'=item->>'id') then
      select value->'record' into job_record from jsonb_array_elements(p_state->'records') where value->>'collection'='investigationJobs' and value->'record'->>'id'=item->>'jobId';
      if job_record is null or job_record->>'status' <> 'leased' or (job_record->'lease'->>'expiresAt')::timestamptz <= commit_time or (job_record->>'deadlineAt')::timestamptz <= commit_time then return false; end if;
    end if;
  end loop;
  delete from public.platform_records where application=p_application and conversation_key=k;
  insert into public.platform_records(application,conversation_key,collection,id,record)
    select p_application,k,value->>'collection',value->'record'->>'id',value->'record' from jsonb_array_elements(p_state->'records');
  insert into public.platform_private_state(application,conversation_key,artifacts,links) values(p_application,k,p_state->'artifacts',p_state->'links')
    on conflict(application,conversation_key) do update set artifacts=excluded.artifacts,links=excluded.links;
  update public.platform_scopes set version=version+1 where application=p_application and conversation_key=k;
  return true;
end $$;
revoke all on function public.platform_load(text,text), public.platform_commit(text,text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.platform_load(text,text), public.platform_commit(text,text,bigint,jsonb) to project_admin;
commit;
