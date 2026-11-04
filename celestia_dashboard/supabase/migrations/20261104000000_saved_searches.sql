-- Saved flight searches, one row per search, owned by the signed-in user.

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  origin jsonb not null,       -- Airport { code, city, name, country }
  destination jsonb not null,  -- Airport { code, city, name, country }
  depart_date date not null,
  return_date date,            -- null = one-way
  trip_type text not null check (trip_type in ('roundtrip', 'oneway')),
  cabin text not null check (cabin in ('economy', 'premium', 'business')),
  adults int not null check (adults between 1 and 9),
  children int not null default 0 check (children between 0 and 8),
  infants int not null default 0 check (infants >= 0),
  created_at timestamptz not null default now()
);

create index saved_searches_user_id_created_at_idx
  on public.saved_searches (user_id, created_at desc);

alter table public.saved_searches enable row level security;

create policy "saved_searches_select_own"
  on public.saved_searches for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "saved_searches_insert_own"
  on public.saved_searches for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "saved_searches_delete_own"
  on public.saved_searches for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- No update policy: saved searches are immutable. Only signed-in users get access.
revoke all on table public.saved_searches from public, anon, authenticated;
grant select, insert, delete on table public.saved_searches to authenticated;
