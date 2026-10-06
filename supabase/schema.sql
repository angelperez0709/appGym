-- Execute in the Supabase SQL Editor for the appGym project.
-- All training data belongs to an authenticated user.
begin;

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  normalized_name text not null,
  default_increment_kg numeric(12,2) not null default 2.5 check (default_increment_kg > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, normalized_name)
);

create table if not exists public.cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('PROGRESSIVE', 'FIXED_BLOCKS')),
  status text not null check (status in ('ACTIVE', 'COMPLETED', 'ARCHIVED')),
  start_one_rm_kg numeric(12,2),
  start_percentage numeric(5,2),
  start_weight_kg numeric(12,2),
  increment_kg numeric(12,2),
  target_end_reps integer not null default 15,
  fixed_sessions_per_weight integer,
  one_rm_formula text not null default 'EPLEY' check (one_rm_formula in ('EPLEY', 'MAYHEW')),
  total_reps integer not null default 0 check (total_reps >= 0),
  total_volume_kg numeric(16,2) not null default 0 check (total_volume_kg >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, exercise_id) references public.exercises(user_id, id) on delete cascade
);

create table if not exists public.cycle_weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cycle_id uuid not null,
  position integer not null check (position between 0 and 2),
  weight_kg numeric(12,2) not null check (weight_kg > 0),
  target_sessions integer not null default 4 check (target_sessions > 0),
  updated_at timestamptz not null default now(),
  unique (user_id, cycle_id, position),
  foreign key (user_id, cycle_id) references public.cycles(user_id, id) on delete cascade
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cycle_id uuid not null,
  performed_at timestamptz not null default now(),
  weight_kg numeric(12,2) not null check (weight_kg > 0),
  prescribed_weight_kg numeric(12,2),
  reps integer not null check (reps > 0),
  volume_kg numeric(16,2) not null check (volume_kg >= 0),
  estimated_one_rm_kg numeric(12,2) not null check (estimated_one_rm_kg > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, cycle_id) references public.cycles(user_id, id) on delete cascade
);

create index if not exists cycles_user_exercise_idx on public.cycles(user_id, exercise_id);
create index if not exists sessions_user_cycle_idx on public.sessions(user_id, cycle_id);

create or replace function public.appgym_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['exercises', 'cycles', 'cycle_weights', 'sessions'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('drop policy if exists own_training_data on public.%I', table_name);
    execute format(
      'create policy own_training_data on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name
    );
    execute format('drop trigger if exists appgym_updated_at on public.%I', table_name);
    execute format('create trigger appgym_updated_at before update on public.%I for each row execute function public.appgym_set_updated_at()', table_name);
  end loop;
end;
$$;

commit;
