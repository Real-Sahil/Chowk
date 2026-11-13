-- Roles + RLS identity helpers. Run ONCE per database as the OWNER role over the DIRECT (unpooled) connection.
-- Idempotent. Contains no secrets: the login password is set out-of-band by scripts/bootstrap-app-role.sh.
--
-- Trust model (see docs/security.md §5):
--   chowk_owner (Neon default owner / migrator)  - DDL only, never used by running services.
--   chowk_app   (this role)                       - runtime login. NOSUPERUSER NOBYPASSRLS. Subject to RLS on every table.
--   Identity enters each transaction via set_config('app.user_id', ..., is_local := true). It is transaction-scoped,
--   so it is safe behind Neon's PgBouncer (transaction mode) and cannot leak to the next client on the same connection.
--   Admin/moderator is NEVER taken from a setting: policies derive it from profiles.role inside Postgres.

create schema if not exists app;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'chowk_app') then
    create role chowk_app nologin nosuperuser nobypassrls nocreatedb nocreaterole noinherit;
  end if;
end $$;

revoke all on schema public from public;
grant usage on schema public to chowk_app;
grant usage on schema app to chowk_app;

-- '' (after a transaction-local setting resets) and NULL both mean "no user".
create or replace function app.current_user_id() returns uuid
  language sql stable parallel safe
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

revoke all on function app.current_user_id() from public;
grant execute on function app.current_user_id() to chowk_app;

-- NOTE: no default privileges are granted. Every migration grants exactly what its tables need,
-- next to the table's RLS policies.
