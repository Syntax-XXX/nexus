create table public.guild_case_counters (
  guild_id text primary key references public.guilds(id) on delete cascade,
  next_case_number integer not null default 1 check (next_case_number > 0),
  updated_at timestamptz not null default now()
);

create table public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references public.guilds(id) on delete cascade,
  case_number integer not null check (case_number > 0),
  action text not null check (action in ('warn', 'kick', 'ban', 'unban', 'timeout', 'untimeout', 'mute', 'unmute', 'purge', 'slowmode', 'lock', 'unlock', 'nickname', 'role')),
  target_user_id text not null check (target_user_id ~ '^[0-9]{17,20}$'),
  moderator_user_id text not null check (moderator_user_id ~ '^[0-9]{17,20}$'),
  reason text,
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  evidence jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (guild_id, case_number)
);
create index moderation_cases_guild_created_idx on public.moderation_cases (guild_id, created_at desc);
create index moderation_cases_target_idx on public.moderation_cases (guild_id, target_user_id, created_at desc);

create table public.warnings (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references public.guilds(id) on delete cascade,
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  user_id text not null check (user_id ~ '^[0-9]{17,20}$'),
  moderator_user_id text not null check (moderator_user_id ~ '^[0-9]{17,20}$'),
  reason text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index warnings_target_idx on public.warnings (guild_id, user_id, created_at desc);

create or replace function public.next_moderation_case_number(p_guild_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated integer;
begin
  insert into public.guild_case_counters (guild_id, next_case_number)
  values (p_guild_id, 2)
  on conflict (guild_id) do update
    set next_case_number = public.guild_case_counters.next_case_number + 1,
        updated_at = now()
  returning next_case_number - 1 into allocated;
  return allocated;
end;
$$;

create or replace function public.assign_moderation_case_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.case_number is null then
    new.case_number := public.next_moderation_case_number(new.guild_id);
  end if;
  return new;
end;
$$;

create trigger moderation_cases_allocate_number
before insert on public.moderation_cases
for each row execute function public.assign_moderation_case_number();

create table public.verification_configs (
  guild_id text primary key references public.guilds(id) on delete cascade,
  mode text not null default 'button' check (mode in ('button', 'captcha', 'question')),
  verified_role_id text check (verified_role_id is null or verified_role_id ~ '^[0-9]{17,20}$'),
  verification_channel_id text check (verification_channel_id is null or verification_channel_id ~ '^[0-9]{17,20}$'),
  minimum_account_age_days integer not null default 0 check (minimum_account_age_days between 0 and 3650),
  timeout_minutes integer not null default 10 check (timeout_minutes between 1 and 10080),
  failure_action text not null default 'kick' check (failure_action in ('kick', 'none')),
  questions jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  config_version bigint not null default 1 check (config_version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.verification_attempts (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references public.guilds(id) on delete cascade,
  user_id text not null check (user_id ~ '^[0-9]{17,20}$'),
  method text not null check (method in ('button', 'captcha', 'question')),
  challenge_hash text,
  attempts integer not null default 0 check (attempts >= 0),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (guild_id, user_id, verified_at)
);
create index verification_attempts_expiry_idx on public.verification_attempts (expires_at) where verified_at is null;

revoke all on table public.guild_case_counters from anon, authenticated;
revoke all on table public.moderation_cases from anon, authenticated;
revoke all on table public.warnings from anon, authenticated;
revoke all on table public.verification_configs from anon, authenticated;
revoke all on table public.verification_attempts from anon, authenticated;
alter table public.guild_case_counters enable row level security;
alter table public.moderation_cases enable row level security;
alter table public.warnings enable row level security;
alter table public.verification_configs enable row level security;
alter table public.verification_attempts enable row level security;
