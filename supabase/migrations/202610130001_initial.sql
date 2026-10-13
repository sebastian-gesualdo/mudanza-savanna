-- Physical JSONB records preserve typed domain fields; generated columns enforce relationships.
create table if not exists moves (
  id uuid primary key, name text not null, moving_date date, timezone text not null default 'America/New_York',
  revision bigint not null default 0, counters jsonb not null default '{"box":0,"bag":0,"furniture":0,"other":0}',
  ai_budget numeric not null default 5 check(ai_budget >= 0)
);
create table if not exists participants (
  id uuid primary key, move_id uuid not null references moves(id), data jsonb not null,
  nickname text generated always as (lower(btrim(data->>'nickname'))) stored,
  unique(move_id,id), unique(move_id,nickname), check ((data->>'id')::uuid=id)
);
create table if not exists move_memberships (
  id uuid primary key, move_id uuid not null references moves(id), participant_id uuid not null,
  email_normalized text not null check(email_normalized=lower(btrim(email_normalized))),
  auth_user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true, linked_at timestamptz, revoked_at timestamptz,
  foreign key(move_id,participant_id) references participants(move_id,id),
  unique(move_id,email_normalized), unique(move_id,participant_id), unique(move_id,auth_user_id)
);
create table if not exists rooms (
  move_id uuid not null references moves(id), key text not null, data jsonb not null, primary key(move_id,key)
);
create table if not exists units (
  id uuid primary key, move_id uuid not null references moves(id), data jsonb not null,
  code text generated always as (data->>'code') stored,
  destination text generated always as (data->>'destination') stored,
  actual_room text generated always as (data->>'actualRoom') stored,
  created_by uuid generated always as ((data->>'createdBy')::uuid) stored,
  unique(move_id,id), unique(move_id,code),
  foreign key(move_id,destination) references rooms(move_id,key),
  foreign key(move_id,actual_room) references rooms(move_id,key),
  foreign key(move_id,created_by) references participants(move_id,id),
  check ((data->>'id')::uuid=id), check (code ~ '^[CBMO]-[0-9]{3,}$'),
  check ((data->>'version')::integer > 0), check ((data->>'count')::integer > 0),
  check (data->>'kind' in ('box','bag','furniture','other')),
  check (data->>'transit' in ('at_origin','in_transit','at_destination')),
  check (data->>'packing' in ('open','closed','not_applicable')),
  check (data->>'unpacking' in ('not_started','partial','done','not_applicable')),
  check (data ?& array['id','kind','code','count','version','createdBy','packing','transit','unpacking']),
  check (data->>'kind' not in ('box','bag') or (data->>'count')::integer=1),
  check (left(code,1)=case data->>'kind' when 'box' then 'C' when 'bag' then 'B' when 'furniture' then 'M' else 'O' end),
  check (data->>'transit'='at_destination' or actual_room is null)
);
create unique index if not exists imported_row_once on units(move_id,(data->'provenance'->>'source'),(data->'provenance'->>'row')) where data->'provenance' is not null;
create index if not exists units_filters on units(move_id,(data->>'transit'),destination);
create table if not exists content_entries (
  id uuid primary key, move_id uuid not null references moves(id), data jsonb not null,
  current_unit uuid generated always as ((data->>'unitId')::uuid) stored,
  last_unit uuid generated always as ((data->>'lastUnitId')::uuid) stored,
  actual_room text generated always as (data->>'room') stored,
  created_by uuid generated always as ((data->>'createdBy')::uuid) stored,
  unique(move_id,id), check ((data->>'id')::uuid=id),
  check (data->>'state' in ('packed','unpacked','archived')),
  check ((data->>'quantity')::numeric > 0 or data->>'quantity' is null),
  foreign key(move_id,current_unit) references units(move_id,id),
  foreign key(move_id,last_unit) references units(move_id,id),
  foreign key(move_id,actual_room) references rooms(move_id,key),
  foreign key(move_id,created_by) references participants(move_id,id),
  check (data ?& array['id','description','original','version','createdBy','lastUnitId','state']),
  check ((data->>'version')::integer > 0),
  check ((data->>'state'='packed' and current_unit is not null) or (data->>'state' in ('unpacked','archived') and current_unit is null))
);
create index if not exists entries_unit on content_entries(move_id,current_unit);
create index if not exists entries_search on content_entries using gin(to_tsvector('simple',data->>'description'));
create table if not exists item_links (
  id uuid primary key, move_id uuid not null references moves(id), data jsonb not null,
  entry_id uuid generated always as ((data->>'entryId')::uuid) stored,
  unit_id uuid generated always as ((data->>'unitId')::uuid) stored,
  foreign key(move_id,entry_id) references content_entries(move_id,id),
  foreign key(move_id,unit_id) references units(move_id,id)
);
create table if not exists events (
  id uuid primary key, move_id uuid not null references moves(id), revision bigint not null,
  actor_id uuid not null, data jsonb not null, unique(move_id,revision),
  foreign key(move_id,actor_id) references participants(move_id,id)
);
create table if not exists command_receipts (
  operation_id uuid not null, move_id uuid not null references moves(id), actor_id uuid not null,
  data jsonb not null, primary key(move_id,operation_id), foreign key(move_id,actor_id) references participants(move_id,id)
);
create table if not exists label_reservations (
  id uuid primary key, move_id uuid not null references moves(id), participant_id uuid not null,
  device_id uuid not null, kind text not null, codes jsonb not null, used jsonb not null default '[]',
  foreign key(move_id,participant_id) references participants(move_id,id)
);
create table if not exists conversations (
  id uuid primary key, move_id uuid not null references moves(id), participant_id uuid not null,
  device_id uuid not null, active_unit_id uuid, version integer not null default 1,
  foreign key(move_id,participant_id) references participants(move_id,id),
  foreign key(move_id,active_unit_id) references units(move_id,id), unique(move_id,id)
);
create table if not exists messages (
  id uuid primary key, move_id uuid not null, conversation_id uuid not null,
  participant_id uuid not null, request_hash text not null, request jsonb not null, response jsonb,
  status text not null, created_at timestamptz not null default now(), lease_until timestamptz,
  foreign key(move_id,conversation_id) references conversations(move_id,id),
  foreign key(move_id,participant_id) references participants(move_id,id)
);
create table if not exists ai_usage (
  id uuid primary key, move_id uuid not null references moves(id), participant_id uuid not null,
  purpose text not null, reserved numeric not null check(reserved>=0), cost numeric,
  model text not null, status text not null, created_at timestamptz not null default now(), details jsonb,
  foreign key(move_id,participant_id) references participants(move_id,id)
);
-- All app data is server-only. No permissive policies, including for authenticated JWTs.
do $$ declare t text; begin
  foreach t in array array['moves','participants','move_memberships','rooms','units','content_entries','item_links','events','command_receipts','label_reservations','conversations','messages','ai_usage'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from public',t);
    if exists(select 1 from pg_roles where rolname='anon') then execute format('revoke all on table %I from anon',t); end if;
    if exists(select 1 from pg_roles where rolname='authenticated') then execute format('revoke all on table %I from authenticated',t); end if;
  end loop;
end $$;
create or replace function immutable_event() returns trigger language plpgsql as $$ begin raise exception 'Events are immutable'; end $$;
drop trigger if exists events_immutable on events;
create trigger events_immutable before update or delete on events for each row execute function immutable_event();
revoke all on function immutable_event() from public;
