-- Chowk RLS, grants and SECURITY DEFINER functions. Hand-written (Drizzle's DSL does not model these).
-- Runs as the OWNER role. Owner bypasses RLS by design; definer functions run as owner. Runtime roles never do.
--> statement-breakpoint
create table app.flags (key text primary key, value boolean not null);
--> statement-breakpoint
insert into app.flags (key, value) values ('allow_playtest_content', false);
--> statement-breakpoint
revoke all on app.flags from public;
--> statement-breakpoint
create function app.playtest_enabled() returns boolean language sql stable security definer set search_path = ''
  as $$ select coalesce((select value from app.flags where key = 'allow_playtest_content'), false) $$;
--> statement-breakpoint
create function app.is_staff() returns boolean language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.profiles p where p.user_id = app.current_user_id()
                        and p.role in ('moderator','admin') and p.status = 'active') $$;
--> statement-breakpoint
create function app.is_admin() returns boolean language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.profiles p where p.user_id = app.current_user_id()
                        and p.role = 'admin' and p.status = 'active') $$;
--> statement-breakpoint
create function app.is_party_member(p_party uuid) returns boolean language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.party_members m where m.party_id = p_party
                        and m.user_id = app.current_user_id() and m.left_at is null) $$;
--> statement-breakpoint
create function app.is_blocked_between(a uuid, b uuid) returns boolean language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.blocks k where k.kind = 'block'
                        and ((k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a))) $$;
--> statement-breakpoint
create function app.quest_visible(p_status public.quest_status) returns boolean language sql stable security definer set search_path = ''
  as $$ select p_status = 'published' or (p_status = 'playtest' and app.playtest_enabled()) $$;
--> statement-breakpoint
create function app.quest_visible_by_id(p_quest uuid) returns boolean language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.quests q where q.id = p_quest and app.quest_visible(q.status)) $$;
--> statement-breakpoint
revoke all on all functions in schema app from public;
--> statement-breakpoint
grant execute on all functions in schema app to chowk_app, chowk_auth;
--> statement-breakpoint
create function app.handle_new_user() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, is_guest)
  values (new.id, 'Player-' || substr(replace(new.id::text, '-', ''), 1, 6), new.is_anonymous);
  return new;
end $$;
--> statement-breakpoint
create trigger on_auth_user_created after insert on auth."user" for each row execute function app.handle_new_user();
--> statement-breakpoint
create function app.sync_guest_flag() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set is_guest = new.is_anonymous where user_id = new.id;
  return new;
end $$;
--> statement-breakpoint
create trigger on_auth_user_guest_changed after update of is_anonymous on auth."user" for each row execute function app.sync_guest_flag();
--> statement-breakpoint
create function app.touch_updated_at() returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;
--> statement-breakpoint
create trigger profiles_touch before update on public.profiles for each row execute function app.touch_updated_at();
--> statement-breakpoint
create trigger characters_touch before update on public.characters for each row execute function app.touch_updated_at();
--> statement-breakpoint
-- Guest -> member linking. Called ONLY by the auth module (chowk_auth) inside Better Auth's onLinkAccount,
-- BEFORE the guest user is deleted. Idempotent; all-or-nothing (single transaction); existing member data wins conflicts.
create function app.transfer_guest_progress(p_guest uuid, p_target uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_guest = p_target then raise exception 'guest and target must differ' using errcode = '22023'; end if;
  if not exists (select 1 from auth."user" where id = p_guest and is_anonymous) then return; end if;  -- already transferred/deleted
  if not exists (select 1 from auth."user" where id = p_target and not is_anonymous) then
    raise exception 'target must be a registered user' using errcode = '22023';
  end if;

  insert into public.quest_completions (user_id, quest_id, party_id, content_version, completed_at)
    select p_target, quest_id, party_id, content_version, completed_at from public.quest_completions where user_id = p_guest
    on conflict (user_id, quest_id) do nothing;

  update public.quest_step_progress t set status = 'completed', completed_at = g.completed_at
    from public.quest_step_progress g
   where g.user_id = p_guest and t.user_id = p_target and t.step_id = g.step_id
     and g.status = 'completed' and t.status <> 'completed';

  update public.verification_attempts a set user_id = p_target
   where a.user_id = p_guest and a.progress_id in (
     select id from public.quest_step_progress where user_id = p_guest
        and step_id not in (select step_id from public.quest_step_progress where user_id = p_target));

  update public.quest_step_progress set user_id = p_target
   where user_id = p_guest and step_id not in (select step_id from public.quest_step_progress where user_id = p_target);

  insert into public.user_badges (user_id, badge_id, quest_id, party_id, issued_at)
    select p_target, badge_id, quest_id, party_id, issued_at from public.user_badges where user_id = p_guest
    on conflict (user_id, badge_id) do nothing;

  update public.characters set user_id = p_target
   where user_id = p_guest and not exists (select 1 from public.characters where user_id = p_target);

  update public.photo_reviews set owner_id = p_target where owner_id = p_guest;

  update public.party_members set user_id = p_target
   where user_id = p_guest and left_at is null
     and not exists (select 1 from public.party_members where user_id = p_target and left_at is null);
  update public.parties set leader_id = p_target where leader_id = p_guest and exists (
    select 1 from public.party_members where party_id = parties.id and user_id = p_target and left_at is null);

  update public.profiles t set
      terms_version = coalesce(t.terms_version, g.terms_version),
      terms_accepted_at = coalesce(t.terms_accepted_at, g.terms_accepted_at),
      privacy_version = coalesce(t.privacy_version, g.privacy_version),
      privacy_accepted_at = coalesce(t.privacy_accepted_at, g.privacy_accepted_at),
      location_consent_at = coalesce(t.location_consent_at, g.location_consent_at)
    from public.profiles g where g.user_id = p_guest and t.user_id = p_target;
end $$;
--> statement-breakpoint
revoke all on function app.transfer_guest_progress(uuid, uuid) from public, chowk_app;
--> statement-breakpoint
grant execute on function app.transfer_guest_progress(uuid, uuid) to chowk_auth;
--> statement-breakpoint
-- Public-safe projections (run as owner; filtered for the caller and for blocks in BOTH directions).
create view public.player_cards as
  select p.user_id, p.display_name, p.avatar_key, c.name as character_name, c.appearance as character_appearance, p.created_at
    from public.profiles p left join public.characters c on c.user_id = p.user_id
   where p.status = 'active' and app.current_user_id() is not null
     and not app.is_blocked_between(p.user_id, app.current_user_id());
--> statement-breakpoint
create view public.player_badges as
  select ub.user_id, b.slug, b.name, b.scope, b.art_key, ub.issued_at
    from public.user_badges ub join public.badges b on b.id = ub.badge_id join public.profiles p on p.user_id = ub.user_id
   where p.status = 'active' and app.current_user_id() is not null
     and not app.is_blocked_between(ub.user_id, app.current_user_id());
--> statement-breakpoint
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname in ('public','auth') loop
    execute format('alter table %s enable row level security', (case when t in ('user','session','account','verification') then 'auth.' else 'public.' end) || quote_ident(t));
  end loop;
end $$;
--> statement-breakpoint
revoke all on all tables in schema public from public, chowk_app, chowk_auth;
--> statement-breakpoint
revoke all on all tables in schema auth from public, chowk_app, chowk_auth;
--> statement-breakpoint
revoke all on schema auth from public, chowk_app;
--> statement-breakpoint
grant usage on schema auth to chowk_auth;
--> statement-breakpoint
grant select, insert, update, delete on auth."user", auth.session, auth.account, auth.verification to chowk_auth;
--> statement-breakpoint
-- auth tables: RLS enabled; only chowk_auth has a policy (it IS the auth module). chowk_app has neither grant nor policy.
create policy auth_user_all on auth."user" for all to chowk_auth using (true) with check (true);
--> statement-breakpoint
create policy auth_session_all on auth.session for all to chowk_auth using (true) with check (true);
--> statement-breakpoint
create policy auth_account_all on auth.account for all to chowk_auth using (true) with check (true);
--> statement-breakpoint
create policy auth_verification_all on auth.verification for all to chowk_auth using (true) with check (true);
--> statement-breakpoint
-- ───── profiles
grant select on public.profiles to chowk_app;
--> statement-breakpoint
grant update (display_name, avatar_key, share_coarse_location, terms_version, terms_accepted_at, privacy_version,
              privacy_accepted_at, location_consent_at, party_location_consent_at, analytics_consent, last_seen_at)
  on public.profiles to chowk_app;
--> statement-breakpoint
create policy profiles_select on public.profiles for select to chowk_app using (user_id = app.current_user_id() or app.is_staff());
--> statement-breakpoint
create policy profiles_update_own on public.profiles for update to chowk_app
  using (user_id = app.current_user_id()) with check (user_id = app.current_user_id());
--> statement-breakpoint
-- ───── characters
grant select, insert, update, delete on public.characters to chowk_app;
--> statement-breakpoint
create policy characters_select on public.characters for select to chowk_app using (user_id = app.current_user_id() or app.is_staff());
--> statement-breakpoint
create policy characters_write_own on public.characters for all to chowk_app
  using (user_id = app.current_user_id()) with check (user_id = app.current_user_id());
--> statement-breakpoint
-- ───── content (read-only for the app role)
grant select on public.places, public.badges, public.quests, public.quest_steps to chowk_app;
--> statement-breakpoint
create policy places_read on public.places for select to chowk_app
  using (active and (provenance = 'reviewed' or app.playtest_enabled() or app.is_staff()));
--> statement-breakpoint
create policy badges_read on public.badges for select to chowk_app
  using (provenance = 'reviewed' or app.playtest_enabled() or app.is_staff());
--> statement-breakpoint
create policy quests_read on public.quests for select to chowk_app using (app.quest_visible(status) or app.is_staff());
--> statement-breakpoint
create policy quest_steps_read on public.quest_steps for select to chowk_app
  using (app.quest_visible_by_id(quest_id) or app.is_staff());
--> statement-breakpoint
-- quest_step_secrets: RLS enabled, NO policy, NO grant => unreadable to every runtime role.
-- ───── parties
grant select on public.parties, public.party_members, public.party_invitations to chowk_app;
--> statement-breakpoint
create policy parties_read on public.parties for select to chowk_app using (app.is_party_member(id) or app.is_staff());
--> statement-breakpoint
create policy party_members_read on public.party_members for select to chowk_app
  using (user_id = app.current_user_id() or app.is_party_member(party_id) or app.is_staff());
--> statement-breakpoint
create policy invitations_read on public.party_invitations for select to chowk_app
  using (inviter_id = app.current_user_id() or invitee_id = app.current_user_id() or app.is_staff());
--> statement-breakpoint
-- ───── progress & rewards (read own; ALL writes via definer functions added in later milestones)
grant select on public.quest_step_progress, public.quest_completions, public.verification_attempts, public.user_badges to chowk_app;
--> statement-breakpoint
create policy progress_read on public.quest_step_progress for select to chowk_app using (user_id = app.current_user_id() or app.is_staff());
--> statement-breakpoint
create policy completions_read on public.quest_completions for select to chowk_app using (user_id = app.current_user_id() or app.is_staff());
--> statement-breakpoint
create policy attempts_read on public.verification_attempts for select to chowk_app using (user_id = app.current_user_id() or app.is_staff());
--> statement-breakpoint
create policy user_badges_read on public.user_badges for select to chowk_app using (user_id = app.current_user_id() or app.is_staff());
--> statement-breakpoint
-- ───── safety & community
grant select, insert, update, delete on public.blocks to chowk_app;
--> statement-breakpoint
create policy blocks_own on public.blocks for all to chowk_app
  using (blocker_id = app.current_user_id()) with check (blocker_id = app.current_user_id());
--> statement-breakpoint
grant select, insert on public.reports to chowk_app;
--> statement-breakpoint
create policy reports_insert on public.reports for insert to chowk_app
  with check (reporter_id = app.current_user_id() and status = 'open');
--> statement-breakpoint
create policy reports_read on public.reports for select to chowk_app using (reporter_id = app.current_user_id() or app.is_staff());
--> statement-breakpoint
grant select, insert on public.submissions to chowk_app;
--> statement-breakpoint
create policy submissions_insert on public.submissions for insert to chowk_app
  with check (submitter_id = app.current_user_id() and status = 'pending' and reviewed_by is null and reviewed_at is null
              and not contains_private_address and subject_consent in ('not_applicable','pending','obtained'));
--> statement-breakpoint
create policy submissions_read on public.submissions for select to chowk_app using (submitter_id = app.current_user_id() or app.is_staff());
--> statement-breakpoint
grant select on public.photo_reviews to chowk_app;
--> statement-breakpoint
create policy photo_reviews_read on public.photo_reviews for select to chowk_app using (owner_id = app.current_user_id() or app.is_staff());
--> statement-breakpoint
grant select on public.moderation_actions to chowk_app;
--> statement-breakpoint
create policy moderation_actions_read on public.moderation_actions for select to chowk_app using (app.is_staff());
--> statement-breakpoint
grant select on public.player_cards, public.player_badges to chowk_app;
--> statement-breakpoint
-- Append-only audit trail: nobody but the owner may modify moderation actions.
revoke update, delete, truncate on public.moderation_actions from public, chowk_app, chowk_auth;
--> statement-breakpoint
create function app.maintenance_purge() returns integer language plpgsql security definer set search_path = '' as $$
declare n integer := 0; c integer;
begin
  delete from public.verification_attempts where created_at < now() - interval '30 days';
  get diagnostics c = row_count; n := n + c;
  update public.party_invitations set status = 'expired', responded_at = now() where status = 'pending' and expires_at < now();
  get diagnostics c = row_count; n := n + c;
  delete from auth."user" u where u.is_anonymous and u.updated_at < now() - interval '30 days'
    and not exists (select 1 from auth.session s where s.user_id = u.id and s.expires_at > now());
  get diagnostics c = row_count; n := n + c;
  return n;
end $$;
--> statement-breakpoint
revoke all on function app.maintenance_purge() from public, chowk_app;
--> statement-breakpoint
grant execute on function app.maintenance_purge() to chowk_auth;
