-- Development-safe registry data only. No fake guilds or users are seeded.
insert into public.plugins (id, name, description, author, category, latest_version, maturity, release_state, trusted, manifest)
values (
  'ping', 'Ping', 'Gateway latency and service availability diagnostics.', 'Nexus', 'utility', '1.0.0',
  'stable', 'published', true,
  '{"dependencies":[],"optionalDependencies":[],"permissions":[],"requiredIntents":[]}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  latest_version = excluded.latest_version,
  manifest = excluded.manifest,
  updated_at = now();
