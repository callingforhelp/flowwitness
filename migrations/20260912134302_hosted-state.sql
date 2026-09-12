-- One application snapshot for the hosted HTTP service.
-- The API process owns this table through the project-admin key; callers never
-- receive that key or direct table access. Versioned RPCs make each save an
-- atomic compare-and-swap so a second machine cannot silently overwrite state.
create table if not exists public.flowwitness_state (
  application text primary key,
  version bigint not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  check (length(application) between 1 and 200),
  check (jsonb_typeof(state) = 'object')
);

revoke all on public.flowwitness_state from anon, authenticated;

create or replace function public.flowwitness_state_load(p_application text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_row public.flowwitness_state;
begin
  if p_application is null or length(p_application) = 0 or length(p_application) > 200 then
    raise exception 'Invalid application';
  end if;
  insert into public.flowwitness_state(application, state)
    values (p_application, jsonb_build_object(
      'workflows', '{}'::jsonb,
      'jobs', '{}'::jsonb,
      'runs', '{}'::jsonb,
      'publications', '[]'::jsonb,
      'questions', '{}'::jsonb,
      'artifacts', '{}'::jsonb,
      'deliveries', '[]'::jsonb,
      'deployment', null,
      'fixture', 'v1'
    ))
    on conflict (application) do nothing;
  select * into v_row from public.flowwitness_state where application = p_application for update;
  return jsonb_build_object(
    'version', v_row.version,
    'state', v_row.state,
    'updated_at', v_row.updated_at
  );
end;
$$;

create or replace function public.flowwitness_state_commit(
  p_application text,
  p_version bigint,
  p_state jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_application is null or length(p_application) = 0 or length(p_application) > 200
     or p_version is null or p_version < 0 or jsonb_typeof(p_state) <> 'object' then
    raise exception 'Invalid state';
  end if;
  update public.flowwitness_state
     set version = version + 1,
         state = p_state,
         updated_at = clock_timestamp()
   where application = p_application and version = p_version;
  return found;
end;
$$;

revoke all on function public.flowwitness_state_load(text), public.flowwitness_state_commit(text,bigint,jsonb)
  from public, anon, authenticated;
grant execute on function public.flowwitness_state_load(text), public.flowwitness_state_commit(text,bigint,jsonb)
  to project_admin;
