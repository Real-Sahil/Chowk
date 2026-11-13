-- Chowk initial schema. Design doc: docs/database.md. Security doc: docs/security.md.
-- Conventions: snake_case; uuid PKs; timestamptz everywhere; RLS enabled on EVERY public table;
-- clients never write game state directly (service role / security-definer RPCs only).

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;   -- NOT in the PostgREST exposed-schemas list
revoke all on schema private from public;
grant usage on schema private to authenticated, anon, service_role;

-- ---------------------------------------------------------------- enums
create type public.content_provenance as enum ('placeholder', 'reviewed');
create type public.quest_status       as enum ('draft', 'playtest', 'published', 'retired');
create type public.step_type          as enum ('geofence', 'site_code', 'party_sync', 'narrative');
create type public.reveal_policy      as enum ('always', 'on_step');
create type public.party_status       as enum ('forming', 'in_run', 'disbanded');
create type public.party_role         as enum ('leader', 'member');
create type public.run_status         as enum ('active', 'completed', 'abandoned', 'expired');
create type public.step_status        as enum ('locked', 'available', 'verifying', 'completed');
create type public.consent_kind       as enum ('terms', 'privacy', 'location_foreground', 'party_location_sharing', 'analytics');
create type public.verify_outcome     as enum ('accepted', 'rejected_distance', 'rejected_accuracy', 'rejected_dwell', 'rejected_code', 'rejected_suspicious', 'pending_review');
create type public.report_kind        as enum ('unsafe_location', 'harassment', 'inaccurate_content', 'cheating', 'other');
create type public.report_status      as enum ('open', 'triaged', 'closed');

-- ---------------------------------------------------------------- private config
create table private.app_flags (
  key   text primary key,
  value jsonb not null
);
-- Production must keep this false: placeholder/playtest quests are then invisible to every client.
insert into private.app_flags (key, value) values ('allow_playtest_content', 'false'::jsonb);

create table private.step_secrets (
  step_id   uuid primary key,       -- FK added after quest_steps exists
  code_hash bytea not null          -- sha256(salt || code); never exposed
);

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  user_id                       uuid primary key references auth.users (id) on delete cascade,
  display_name                  text not null check (char_length(display_name) between 2 and 24),
  avatar_key                    text not null default 'placeholder-a',
  share_coarse_location         boolean not null default false,   -- PRIV-3: opt-in, default off
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  last_seen_at                  timestamptz not null default now()
);

create table public.consent_records (          -- append-only ledger
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           public.consent_kind not null,
  granted        boolean not null,
  policy_version text not null,
  recorded_at    timestamptz not null default now()
);
create index on public.consent_records (user_id, kind, recorded_at desc);

-- ---------------------------------------------------------------- world + content
create table public.districts (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name       text not null,
  provenance public.content_provenance not null default 'placeholder',
  boundary   extensions.geography(Polygon, 4326),
  active     boolean not null default true
);

create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  district_id     uuid not null references public.districts (id),
  key             text not null,
  name            text not null,
  geom            extensions.geography(Point, 4326) not null,
  is_public_space boolean not null check (is_public_space),   -- SAFE-1: no private premises, ever
  reveal          public.reveal_policy not null default 'on_step',
  provenance      public.content_provenance not null default 'placeholder',
  active          boolean not null default true,
  unique (district_id, key)
);
create index on public.locations using gist (geom);

create table public.quests (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  title           text not null,
  blurb           text not null default '',
  provenance      public.content_provenance not null default 'placeholder',
  status          public.quest_status not null default 'draft',
  min_party_size  smallint not null default 1 check (min_party_size between 1 and 6),
  max_party_size  smallint not null default 4 check (max_party_size between min_party_size and 6),
  est_minutes     smallint not null check (est_minutes between 5 and 240),
  daylight_only   boolean not null default true,
  content_version integer not null default 1,
  reviewed_by     uuid references auth.users (id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  -- CONTENT-1: placeholder content can never be 'published'; published needs a recorded review.
  constraint quests_placeholder_never_published check (provenance = 'reviewed' or status in ('draft', 'playtest')),
  constraint quests_published_reviewed check (status <> 'published' or (reviewed_by is not null and reviewed_at is not null))
);

create table public.quest_steps (
  id          uuid primary key default gen_random_uuid(),
  quest_id    uuid not null references public.quests (id) on delete cascade,
  ordinal     smallint not null check (ordinal >= 0),
  location_id uuid references public.locations (id),
  title       text not null,
  body        text not null default '',
  step_type   public.step_type not null,
  config      jsonb not null default '{}'::jsonb,   -- validated against StepConfig (packages/contracts) at ingest
  unique (quest_id, ordinal)
);
alter table private.step_secrets add foreign key (step_id) references public.quest_steps (id) on delete cascade;

create table public.stamps (
  id         uuid primary key default gen_random_uuid(),
  quest_id   uuid not null references public.quests (id) on delete cascade,
  slug       text not null unique,
  name       text not null,
  provenance public.content_provenance not null default 'placeholder'
);

-- ---------------------------------------------------------------- parties
create table public.parties (
  id                   uuid primary key default gen_random_uuid(),
  leader_id            uuid not null references auth.users (id),
  status               public.party_status not null default 'forming',
  max_size             smallint not null default 4 check (max_size between 2 and 6),
  join_code            text not null check (join_code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  join_code_expires_at timestamptz not null default now() + interval '30 minutes',
  created_at           timestamptz not null default now(),
  disbanded_at         timestamptz
);
create unique index parties_active_code on public.parties (join_code) where status <> 'disbanded';

create table public.party_members (
  party_id  uuid not null references public.parties (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      public.party_role not null default 'member',
  ready     boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (party_id, user_id)
);
-- A user can be in at most one live party.
create unique index party_members_one_live on public.party_members (user_id) where left_at is null;

-- ---------------------------------------------------------------- runs & verification
create table public.quest_runs (
  id              uuid primary key default gen_random_uuid(),
  quest_id        uuid not null references public.quests (id),
  party_id        uuid references public.parties (id),
  created_by      uuid not null references auth.users (id),
  status          public.run_status not null default 'active',
  content_version integer not null,
  current_ordinal smallint not null default 0,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  expires_at      timestamptz not null default now() + interval '12 hours'
);
create index on public.quest_runs (created_by, status);

create table public.quest_run_members (
  run_id    uuid not null references public.quest_runs (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (run_id, user_id)
);
create index on public.quest_run_members (user_id);

create table public.verification_attempts (    -- PRIV-2: NO coordinates stored, only bands
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.quest_runs (id) on delete cascade,
  step_id       uuid not null references public.quest_steps (id),
  user_id       uuid not null references auth.users (id) on delete cascade,
  outcome       public.verify_outcome not null,
  distance_band text check (distance_band in ('very_close', 'close', 'far', 'unknown')),
  accuracy_m    smallint,
  reason_flags  text[] not null default '{}',
  created_at    timestamptz not null default now()
);
create index on public.verification_attempts (run_id, step_id, created_at desc);
create index on public.verification_attempts (created_at);   -- retention sweep

create table public.quest_run_steps (
  run_id          uuid not null references public.quest_runs (id) on delete cascade,
  step_id         uuid not null references public.quest_steps (id),
  status          public.step_status not null default 'locked',
  completed_at    timestamptz,
  completed_by    uuid references auth.users (id),
  attempt_id      uuid references public.verification_attempts (id),
  primary key (run_id, step_id)
);

create table public.user_stamps (
  user_id   uuid not null references auth.users (id) on delete cascade,
  stamp_id  uuid not null references public.stamps (id),
  run_id    uuid not null references public.quest_runs (id),
  earned_at timestamptz not null default now(),
  primary key (user_id, stamp_id)
);

-- ---------------------------------------------------------------- safety & ops
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references auth.users (id) on delete cascade,
  kind             public.report_kind not null,
  subject_user_id  uuid references auth.users (id) on delete set null,
  subject_party_id uuid references public.parties (id) on delete set null,
  subject_location_id uuid references public.locations (id) on delete set null,
  detail           text check (char_length(detail) <= 500),
  status           public.report_status not null default 'open',
  created_at       timestamptz not null default now()
);

create table public.audit_log (            -- service-role only; no policies = deny all
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ================================================================ helper functions (private)
create or replace function private.is_anonymous() returns boolean
language sql stable as $$ select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) $$;

create or replace function private.is_party_member(p_party uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.party_members m
                 where m.party_id = p_party and m.user_id = (select auth.uid()) and m.left_at is null)
$$;

create or replace function private.shares_party_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1
                 from public.party_members a join public.party_members b on a.party_id = b.party_id
                 where a.user_id = (select auth.uid()) and b.user_id = p_user
                   and a.left_at is null and b.left_at is null)
$$;

create or replace function private.is_run_member(p_run uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.quest_run_members m
                 where m.run_id = p_run and m.user_id = (select auth.uid()))
$$;

create or replace function private.quest_visible(p_status public.quest_status) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_status = 'published'
      or (p_status = 'playtest'
          and coalesce((select (value)::text::boolean from private.app_flags where key = 'allow_playtest_content'), false))
$$;

create or replace function private.location_revealed(p_location uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.locations l where l.id = p_location and l.active and l.reveal = 'always')
      or exists (select 1
                 from public.quest_run_steps s
                 join public.quest_steps qs on qs.id = s.step_id
                 join public.quest_runs r on r.id = s.run_id
                 join public.quest_run_members m on m.run_id = r.id
                 where qs.location_id = p_location and m.user_id = (select auth.uid())
                   and r.status = 'active' and s.status in ('available', 'verifying', 'completed'))
$$;

revoke execute on all functions in schema private from public;
grant  execute on all functions in schema private to authenticated, anon, service_role;

-- ================================================================ profile bootstrap
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, 'Guest-' || substr(replace(new.id::text, '-', ''), 1, 5));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- ================================================================ party RPCs (security definer)
-- Clients never INSERT/UPDATE parties directly. These are the only client-callable writers.
create or replace function public.create_party(p_max_size smallint default 4)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_party uuid;
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code  text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_max_size not between 2 and 6 then raise exception 'bad size' using errcode = '22023'; end if;
  for i in 1..5 loop
    v_code := '';
    for j in 1..6 loop
      v_code := v_code || substr(v_alpha, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(v_alpha)), 1);
    end loop;
    begin
      insert into public.parties (leader_id, max_size, join_code) values (v_uid, p_max_size, v_code) returning id into v_party;
      exit;
    exception when unique_violation then null; end;
  end loop;
  if v_party is null then raise exception 'code allocation failed'; end if;
  insert into public.party_members (party_id, user_id, role) values (v_party, v_uid, 'leader');  -- fails if already in a live party
  return v_party;
end $$;

create or replace function public.join_party(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_p   public.parties;
  v_n   int;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  -- Uniform error for unknown/expired/full so codes cannot be probed. Per-user rate limit lives at the edge (docs/security.md, ABUSE-2).
  select * into v_p from public.parties
   where join_code = upper(p_code) and status = 'forming' and join_code_expires_at > now() for update;
  if not found then raise exception 'cannot join' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.party_members where party_id = v_p.id and left_at is null;
  if v_n >= v_p.max_size then raise exception 'cannot join' using errcode = 'P0001'; end if;
  insert into public.party_members (party_id, user_id) values (v_p.id, v_uid);
  return v_p.id;
end $$;

create or replace function public.leave_party(p_party uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_next uuid;
begin
  update public.party_members set left_at = now(), ready = false
   where party_id = p_party and user_id = v_uid and left_at is null;
  if not found then return; end if;
  if (select leader_id from public.parties where id = p_party) = v_uid then
    select user_id into v_next from public.party_members
     where party_id = p_party and left_at is null order by joined_at limit 1;
    if v_next is null then
      update public.parties set status = 'disbanded', disbanded_at = now() where id = p_party;
    else
      update public.parties set leader_id = v_next where id = p_party;
      update public.party_members set role = 'leader' where party_id = p_party and user_id = v_next;
    end if;
    update public.party_members set role = 'member' where party_id = p_party and user_id = v_uid;
  end if;
end $$;

revoke execute on function public.create_party(smallint), public.join_party(text), public.leave_party(uuid) from public, anon;
grant  execute on function public.create_party(smallint), public.join_party(text), public.leave_party(uuid) to authenticated;
-- NOTE: Supabase anonymous (guest) users hold the `authenticated` role with is_anonymous=true, so guests may use these RPCs.

-- ================================================================ RLS
alter table public.profiles              enable row level security;
alter table public.consent_records       enable row level security;
alter table public.districts             enable row level security;
alter table public.locations             enable row level security;
alter table public.quests                enable row level security;
alter table public.quest_steps           enable row level security;
alter table public.stamps                enable row level security;
alter table public.parties               enable row level security;
alter table public.party_members         enable row level security;
alter table public.quest_runs            enable row level security;
alter table public.quest_run_members     enable row level security;
alter table public.quest_run_steps       enable row level security;
alter table public.verification_attempts enable row level security;
alter table public.user_stamps           enable row level security;
alter table public.reports               enable row level security;
alter table public.audit_log             enable row level security;   -- intentionally no policies
alter table private.app_flags            enable row level security;   -- no policies: service role only
alter table private.step_secrets         enable row level security;

-- Default-deny at the grant layer too: start from nothing, grant narrowly.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

-- profiles: own row + live party-mates. Column-limited updates.
grant select on public.profiles to authenticated;
grant update (display_name, avatar_key, share_coarse_location) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or private.shares_party_with(user_id));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- consent: append-only, own rows
grant select, insert on public.consent_records to authenticated;
create policy consent_select on public.consent_records for select to authenticated using (user_id = (select auth.uid()));
create policy consent_insert on public.consent_records for insert to authenticated with check (user_id = (select auth.uid()));

-- world/content: read-only, gated by publication state
grant select on public.districts, public.locations, public.quests, public.quest_steps, public.stamps to authenticated;
create policy districts_read on public.districts for select to authenticated using (active);
create policy locations_read on public.locations for select to authenticated
  using (active and private.location_revealed(id));
create policy quests_read on public.quests for select to authenticated using (private.quest_visible(status));
create policy steps_read on public.quest_steps for select to authenticated
  using (exists (select 1 from public.quests q where q.id = quest_id and private.quest_visible(q.status)));
create policy stamps_read on public.stamps for select to authenticated
  using (exists (select 1 from public.quests q where q.id = quest_id and private.quest_visible(q.status)));

-- parties: members read; all writes via RPC / service role
grant select on public.parties, public.party_members to authenticated;
create policy parties_read on public.parties for select to authenticated using (private.is_party_member(id));
create policy party_members_read on public.party_members for select to authenticated using (private.is_party_member(party_id));

-- runs: members read; all writes via service role (realtime server)
grant select on public.quest_runs, public.quest_run_members, public.quest_run_steps to authenticated;
create policy runs_read on public.quest_runs for select to authenticated using (private.is_run_member(id));
create policy run_members_read on public.quest_run_members for select to authenticated using (private.is_run_member(run_id));
create policy run_steps_read on public.quest_run_steps for select to authenticated using (private.is_run_member(run_id));

-- verification attempts + stamps: own only
grant select on public.verification_attempts, public.user_stamps to authenticated;
create policy attempts_read on public.verification_attempts for select to authenticated using (user_id = (select auth.uid()));
create policy user_stamps_read on public.user_stamps for select to authenticated using (user_id = (select auth.uid()));

-- reports: write-only inbox for the reporter (cannot read others, cannot edit)
grant select, insert on public.reports to authenticated;
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');
create policy reports_read on public.reports for select to authenticated using (reporter_id = (select auth.uid()));

-- ================================================================ retention (schedule with pg_cron in M1)
create or replace function private.purge_expired() returns void
language sql security definer set search_path = '' as $$
  delete from public.verification_attempts where created_at < now() - interval '30 days';
  update public.parties set status = 'disbanded', disbanded_at = now()
   where status = 'forming' and join_code_expires_at < now() - interval '1 day';
  update public.quest_runs set status = 'expired', ended_at = now()
   where status = 'active' and expires_at < now();
$$;
revoke execute on function private.purge_expired() from public, anon, authenticated;
