-- Case allocation is an internal database operation. It must never be
-- callable through the PostgREST RPC surface by browser roles.
revoke execute on function public.next_moderation_case_number(text) from public, anon, authenticated;
revoke execute on function public.assign_moderation_case_number() from public, anon, authenticated;
grant execute on function public.next_moderation_case_number(text) to postgres, service_role;
grant execute on function public.assign_moderation_case_number() to postgres, service_role;
