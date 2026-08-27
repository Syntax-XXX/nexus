create extension if not exists pgcrypto with schema extensions;

create table public.guilds (
  id text primary key check (id ~ '^[0-9]{17,20}$'),
  name text,
  icon_hash text,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.guild_configs (
  guild_id text not null references public.guilds(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  value jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (guild_id, key)
);

create table public.plugins (
  id text primary key check (id ~ '^[a-z][a-z0-9.-]{2,63}$'),
  name text not null,
  description text not null default '',
  latest_version text not null,
  author text not null,
  manifest jsonb not null,
  trusted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guild_plugins (
  guild_id text not null references public.guilds(id) on delete cascade,
  plugin_id text not null references public.plugins(id) on delete restrict,
  version text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (guild_id, plugin_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  guild_id text references public.guilds(id) on delete cascade,
  actor_discord_id text check (actor_discord_id is null or actor_discord_id ~ '^[0-9]{17,20}$'),
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_guild_created_idx on public.audit_logs (guild_id, created_at desc);
create index guild_plugins_enabled_idx on public.guild_plugins (guild_id) where enabled;

alter table public.guilds enable row level security;
alter table public.guild_configs enable row level security;
alter table public.plugins enable row level security;
alter table public.guild_plugins enable row level security;
alter table public.audit_logs enable row level security;

-- Deny browser/Data API access until the dashboard authorization tables and
-- ownership-aware policies are introduced. Bot and migrations use Postgres roles.
revoke all on table public.guilds from anon, authenticated;
revoke all on table public.guild_configs from anon, authenticated;
revoke all on table public.plugins from anon, authenticated;
revoke all on table public.guild_plugins from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
