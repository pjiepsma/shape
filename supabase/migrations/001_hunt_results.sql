-- Hunt complete results for daily leaderboard
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

alter table public.hunt_results enable row level security;

create policy "hunt_results_select_all"
  on public.hunt_results for select
  to anon, authenticated
  using (true);

create policy "hunt_results_insert_own"
  on public.hunt_results for insert
  to authenticated
  with check (auth.uid() = user_id);

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
