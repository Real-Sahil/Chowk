-- RLS smoke test. Run against a LOCAL Supabase db (`supabase db reset && psql ... -f this`), never prod.
-- Verified manually against Postgres 16 with stubbed auth.* (PostGIS shimmed) when the schema was authored.
-- Replace with pgTAP in M1 (see docs/implementation-plan.md).
insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.create_party(3::smallint) as party \gset
select join_code as code from public.parties \gset
do $$ begin assert (select count(*) from public.parties) = 1, 'leader sees own party'; end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin assert (select count(*) from public.parties) = 0, 'non-member sees no parties'; end $$;
select public.join_party(:'code');
do $$ begin assert (select count(*) from public.parties) = 1, 'member sees party after join'; end $$;
do $$ begin assert (select count(*) from public.profiles) = 2, 'self + party-mate only'; end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin assert (select count(*) from public.profiles) = 1, 'outsider sees only self'; end $$;
do $$ begin
  begin perform public.join_party('AAAAAA'); assert false, 'bad code must fail';
  exception when sqlstate 'P0001' then null; end;
  begin update public.parties set max_size = 6; assert false, 'direct write must be denied';
  exception when insufficient_privilege then null; end;
  begin insert into public.quest_runs(quest_id, created_by, content_version) values (gen_random_uuid(), auth.uid(), 1);
        assert false, 'direct run insert must be denied';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$ begin
  begin insert into public.quests(slug, title, provenance, status, est_minutes) values ('test-quest', 'x', 'placeholder', 'published', 10);
        assert false, 'placeholder must never publish';
  exception when check_violation then null; end;
end $$;
