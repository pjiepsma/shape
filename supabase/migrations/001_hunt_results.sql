-- Outsee hunt results + profiles (full schema — clear DB then apply this file)

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(trim(display_name)) between 1 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_display_name_ci_idx
  on public.profiles (lower(trim(display_name)));

alter table public.profiles enable row level security;

create policy "profiles_select_all"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.hunt_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 24),
  end_score real not null check (end_score >= 0 and end_score <= 1),
  result_image_path text not null,
  hunt_date date not null default (timezone('utc', now())::date),
  created_at timestamptz not null default now()
);

create index hunt_results_daily_score_idx
  on public.hunt_results (hunt_date desc, end_score desc);

create index hunt_results_user_score_idx
  on public.hunt_results (user_id, end_score desc);

alter table public.hunt_results enable row level security;

create policy "hunt_results_select_all"
  on public.hunt_results for select
  to anon, authenticated
  using (true);

create policy "hunt_results_insert_own"
  on public.hunt_results for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Best single hunt score per user (all-time board)
create or replace function public.fetch_leaderboard_all_time(result_limit int default 50)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  end_score real,
  result_image_path text,
  hunt_date date,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    best.id,
    best.user_id,
    best.display_name,
    best.end_score,
    best.result_image_path,
    best.hunt_date,
    best.created_at
  from (
    select distinct on (hr.user_id)
      hr.id,
      hr.user_id,
      coalesce(p.display_name, hr.display_name) as display_name,
      hr.end_score,
      hr.result_image_path,
      hr.hunt_date,
      hr.created_at
    from public.hunt_results hr
    left join public.profiles p on p.user_id = hr.user_id
    order by hr.user_id, hr.end_score desc, hr.created_at desc
  ) best
  order by best.end_score desc, best.created_at asc
  limit greatest(1, least(result_limit, 100));
$$;

grant execute on function public.fetch_leaderboard_all_time(int) to anon, authenticated;

-- Average hunt score per user (all-time board); mosaic from that player's best hunt
create or replace function public.fetch_leaderboard_avg_all_time(result_limit int default 50)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  end_score real,
  result_image_path text,
  hunt_date date,
  created_at timestamptz,
  hunt_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    best.id,
    averages.user_id,
    coalesce(p.display_name, best.display_name) as display_name,
    averages.avg_score as end_score,
    best.result_image_path,
    best.hunt_date,
    best.created_at,
    averages.hunt_count
  from (
    select
      hr.user_id,
      avg(hr.end_score)::real as avg_score,
      count(*)::int as hunt_count
    from public.hunt_results hr
    group by hr.user_id
  ) averages
  inner join lateral (
    select
      hr.id,
      hr.user_id,
      hr.display_name,
      hr.result_image_path,
      hr.hunt_date,
      hr.created_at
    from public.hunt_results hr
    where hr.user_id = averages.user_id
    order by hr.end_score desc, hr.created_at desc
    limit 1
  ) best on true
  left join public.profiles p on p.user_id = averages.user_id
  order by averages.avg_score desc, averages.hunt_count desc, best.created_at asc
  limit greatest(1, least(result_limit, 100));
$$;

grant execute on function public.fetch_leaderboard_avg_all_time(int) to anon, authenticated;

-- Storage bucket for mosaic JPEGs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hunt-results',
  'hunt-results',
  true,
  5242880,
  array['image/jpeg']
)
on conflict (id) do nothing;

create policy "hunt_results_storage_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'hunt-results');

create policy "hunt_results_storage_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'hunt-results'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
