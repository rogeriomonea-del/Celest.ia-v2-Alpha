-- Hardening for saved_searches: shape/size checks on the Airport jsonb columns,
-- passenger and date consistency, and a cap of 50 saved searches per user.
-- The table is written directly from the browser (RLS), so these checks are the
-- only server-side validation of what gets stored.

alter table public.saved_searches
  add constraint saved_searches_origin_shape check (
    jsonb_typeof(origin) = 'object'
    and pg_column_size(origin) < 1024
    and coalesce(origin ->> 'code', '') ~ '^[A-Z]{3}$'
  ),
  add constraint saved_searches_destination_shape check (
    jsonb_typeof(destination) = 'object'
    and pg_column_size(destination) < 1024
    and coalesce(destination ->> 'code', '') ~ '^[A-Z]{3}$'
  ),
  add constraint saved_searches_infants_per_adult check (infants between 0 and adults),
  add constraint saved_searches_max_seated check (adults + children <= 9),
  add constraint saved_searches_trip_type_return check ((trip_type = 'oneway') = (return_date is null)),
  add constraint saved_searches_return_after_depart check (return_date is null or return_date >= depart_date);

-- Runs as the inserting user (security invoker), so the count goes through RLS and
-- sees only that user's own rows, which is exactly the rows with this user_id.
create function public.saved_searches_enforce_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serialize concurrent inserts for the same user so two requests cannot both pass the check.
  perform pg_advisory_xact_lock(hashtextextended('saved_searches:' || new.user_id::text, 0));
  if (select count(*) from public.saved_searches where user_id = new.user_id) >= 50 then
    raise exception 'saved_searches limit reached (50 per user)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.saved_searches_enforce_limit() from public, anon, authenticated;

create trigger saved_searches_enforce_limit
  before insert on public.saved_searches
  for each row execute function public.saved_searches_enforce_limit();
