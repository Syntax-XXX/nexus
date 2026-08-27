create schema if not exists nexus_private;
revoke all on schema nexus_private from public, anon, authenticated;

create type public.feature_maturity as enum ('stable', 'beta', 'experimental', 'disabled');
create type public.plugin_health_state as enum (
  'enabled', 'disabled', 'starting', 'healthy', 'degraded', 'failed', 'incompatible'
);
create type public.plugin_release_state as enum ('private', 'beta', 'verified', 'published', 'disabled');
create type public.permission_effect as enum ('allow', 'deny');
create type public.feature_flag_scope as enum ('global', 'guild', 'owner_override');

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_user_id text not null unique check (discord_user_id ~ '^[0-9]{17,20}$'),
  username text not null,
  avatar_hash text,
  locale text not null default 'en' check (locale in ('en', 'de')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table nexus_private.discord_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token_ciphertext bytea not null,
  refresh_token_ciphertext bytea,
  token_nonce bytea not null,
  scopes text[] not null default '{}',
  expires_at timestamptz not null,
  refreshed_at timestamptz not null default now()
);

create table public.guild_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  guild_id text not null references public.guilds(id) on delete cascade,
  discord_permissions bigint not null default 0,
  is_owner boolean not null default false,
  validated_at timestamptz not null,
  primary key (user_id, guild_id)
);
create index guild_memberships_guild_idx on public.guild_memberships (guild_id, user_id);
create index guild_memberships_stale_idx on public.guild_memberships (validated_at);

alter table public.guilds
  add column if not exists owner_id text check (owner_id is null or owner_id ~ '^[0-9]{17,20}$'),
  add column if not exists setup_completed_at timestamptz,
  add column if not exists config_version bigint not null default 0,
  add column if not exists retention_days integer not null default 30 check (retention_days between 0 and 90),
  add column if not exists deleted_at timestamptz;

alter table public.plugins
  add column if not exists category text not null default 'utility',
  add column if not exists maturity public.feature_maturity not null default 'beta',
  add column if not exists release_state public.plugin_release_state not null default 'private',
  add column if not exists globally_enabled boolean not null default true,
  add column if not exists config_schema jsonb not null default '{}'::jsonb,
  add column if not exists dashboard_schema jsonb not null default '{}'::jsonb;

create table public.plugin_versions (
  plugin_id text not null references public.plugins(id) on delete cascade,
  version text not null,
  api_version integer not null check (api_version > 0),
  manifest jsonb not null,
  checksum text not null,
  release_state public.plugin_release_state not null default 'private',
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (plugin_id, version)
);

alter table public.guild_plugins
  add column if not exists config_version bigint not null default 0,
  add column if not exists schema_version integer not null default 1,
  add column if not exists health public.plugin_health_state not null default 'disabled',
  add column if not exists last_error_id uuid,
  add column if not exists enabled_at timestamptz,
  add column if not exists disabled_at timestamptz;

create table public.plugin_health_reports (
  id uuid primary key default gen_random_uuid(),
  plugin_id text not null references public.plugins(id) on delete cascade,
  guild_id text references public.guilds(id) on delete cascade,
  service text not null,
  instance_id text not null,
  state public.plugin_health_state not null,
  consecutive_failures integer not null default 0,
  message text,
  details jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);
create index plugin_health_current_idx on public.plugin_health_reports
  (plugin_id, guild_id, observed_at desc);

create table public.nexus_permission_bindings (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references public.guilds(id) on delete cascade,
  subject_type text not null check (subject_type in ('role', 'user')),
  subject_id text not null check (subject_id ~ '^[0-9]{17,20}$'),
  permission text not null check (permission ~ '^nexus(\.[a-z0-9*-]+)+$'),
  effect public.permission_effect not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (guild_id, subject_type, subject_id, permission)
);
create index nexus_permission_lookup_idx on public.nexus_permission_bindings
  (guild_id, subject_type, subject_id);

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9-]{1,63}$'),
  description text not null,
  maturity public.feature_maturity not null default 'experimental',
  globally_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.feature_flag_overrides (
  flag_key text not null references public.feature_flags(key) on delete cascade,
  scope public.feature_flag_scope not null,
  guild_id text references public.guilds(id) on delete cascade,
  enabled boolean not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((scope = 'global' and guild_id is null) or (scope <> 'global' and guild_id is not null)),
  unique nulls not distinct (flag_key, scope, guild_id)
);

create table public.blacklisted_users (
  discord_user_id text primary key check (discord_user_id ~ '^[0-9]{17,20}$'),
  reason text not null,
  created_by_discord_id text not null check (created_by_discord_id ~ '^[0-9]{17,20}$'),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index blacklisted_users_active_idx on public.blacklisted_users (expires_at);

create table public.blacklisted_guilds (
  guild_id text primary key check (guild_id ~ '^[0-9]{17,20}$'),
  reason text not null,
  created_by_discord_id text not null check (created_by_discord_id ~ '^[0-9]{17,20}$'),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.domain_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  guild_id text references public.guilds(id) on delete cascade,
  correlation_id uuid not null default gen_random_uuid(),
  causation_id uuid,
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  published_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
create index domain_outbox_unpublished_idx on public.domain_outbox (occurred_at)
  where published_at is null;

create table public.command_usage (
  id uuid primary key default gen_random_uuid(),
  interaction_id text not null unique check (interaction_id ~ '^[0-9]{17,20}$'),
  guild_id text references public.guilds(id) on delete cascade,
  user_id_hash text,
  plugin_id text not null references public.plugins(id) on delete restrict,
  command text not null,
  success boolean not null,
  duration_ms integer not null check (duration_ms >= 0),
  error_code text,
  created_at timestamptz not null default now()
);
create index command_usage_guild_created_idx on public.command_usage (guild_id, created_at desc);
create index command_usage_plugin_created_idx on public.command_usage (plugin_id, created_at desc);

create table public.system_errors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  service text not null,
  plugin_id text references public.plugins(id) on delete set null,
  guild_id text references public.guilds(id) on delete cascade,
  severity text not null check (severity in ('warning', 'error', 'fatal')),
  message text not null,
  stack text,
  context jsonb not null default '{}'::jsonb,
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (fingerprint, service, plugin_id, guild_id)
);
create index system_errors_unresolved_idx on public.system_errors (last_seen_at desc)
  where resolved_at is null;

alter table public.audit_logs
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists resource_type text,
  add column if not exists resource_id text,
  add column if not exists old_value jsonb,
  add column if not exists new_value jsonb,
  add column if not exists request_id text,
  add column if not exists ip_address inet;

create or replace function nexus_private.notify_config_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_notify(
    'nexus_config',
    json_build_object(
      'guildId', new.guild_id,
      'pluginId', new.plugin_id,
      'version', new.config_version
    )::text
  );
  return new;
end;
$$;

create trigger guild_plugins_notify_config
after insert or update of enabled, config, config_version on public.guild_plugins
for each row execute function nexus_private.notify_config_change();

alter table public.user_profiles enable row level security;
alter table public.guild_memberships enable row level security;
alter table public.plugin_versions enable row level security;
alter table public.plugin_health_reports enable row level security;
alter table public.nexus_permission_bindings enable row level security;
alter table public.feature_flags enable row level security;
alter table public.feature_flag_overrides enable row level security;
alter table public.blacklisted_users enable row level security;
alter table public.blacklisted_guilds enable row level security;
alter table public.domain_outbox enable row level security;
alter table public.command_usage enable row level security;
alter table public.system_errors enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select, update on public.user_profiles to authenticated;
grant select on public.guild_memberships to authenticated;

create policy "users read own profile" on public.user_profiles
for select to authenticated using ((select auth.uid()) = id);
create policy "users update own profile" on public.user_profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
create policy "users read fresh own guild memberships" on public.guild_memberships
for select to authenticated
using ((select auth.uid()) = user_id and validated_at > now() - interval '10 minutes');
