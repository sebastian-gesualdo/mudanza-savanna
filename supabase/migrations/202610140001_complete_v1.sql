-- Additive v1 completion. Existing inventory, authors and budgets are preserved.
alter table messages add column if not exists lease_token uuid;
alter table messages add column if not exists attempts integer not null default 0;
alter table messages add column if not exists updated_at timestamptz not null default now();
alter table ai_usage add column if not exists request_key text;
create unique index if not exists ai_request_once on ai_usage(move_id,participant_id,request_key) where request_key is not null;
create index if not exists messages_history on messages(move_id,participant_id,conversation_id,created_at,id);
create index if not exists ai_rate_window on ai_usage(move_id,created_at,participant_id);

create table if not exists ai_read_cache (
  move_id uuid not null references moves(id), participant_id uuid not null,
  cache_key text not null, result jsonb not null, expires_at timestamptz not null,
  primary key(move_id,participant_id,cache_key),
  foreign key(move_id,participant_id) references participants(move_id,id)
);
create table if not exists import_sources (
  id uuid primary key, move_id uuid not null references moves(id),
  participant_id uuid not null, source_hash text not null, source_name text not null,
  revision integer not null default 1, created_at timestamptz not null default now(),
  unique(move_id,id), foreign key(move_id,participant_id) references participants(move_id,id)
);
create table if not exists import_rows (
  move_id uuid not null, source_id uuid not null, row_number integer not null,
  original jsonb not null, decision jsonb, unit_id uuid, operation_id uuid,
  status text not null default 'pending' check(status in ('pending','excluded','applied')),
  primary key(move_id,source_id,row_number),
  foreign key(move_id,source_id) references import_sources(move_id,id),
  foreign key(move_id,unit_id) references units(move_id,id)
);
do $$ declare t text; begin
  foreach t in array array['ai_read_cache','import_sources','import_rows'] loop
    execute format('alter table %I enable row level security',t);
    execute format('revoke all on table %I from public',t);
    if exists(select 1 from pg_roles where rolname='anon') then execute format('revoke all on table %I from anon',t); end if;
    if exists(select 1 from pg_roles where rolname='authenticated') then execute format('revoke all on table %I from authenticated',t); end if;
  end loop;
end $$;
