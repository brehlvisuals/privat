-- Performance OS — Initiales Schema + RLS
-- Eine Person, ein Account. Alle persönlichen Tabellen sind über auth.uid()
-- via Row Level Security abgesichert.

-- ============================================================
-- Tabellen
-- ============================================================

-- Profil / Ziele (eine Zeile pro User)
create table if not exists public.profile (
  id uuid primary key references auth.users on delete cascade,
  bmr int default 1950,
  protein_target int default 180,
  fat_target int default 70,
  carbs_target int default 460,
  updated_at timestamptz default now()
);

-- Übungs-Bibliothek
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  muscle_group text,
  gym text,
  is_custom boolean default true,
  created_at timestamptz default now()
);

-- Workouts (gespeicherte Trainings)
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  name text,
  duration_min int,
  created_at timestamptz default now()
);

-- Übungen innerhalb eines Workouts (Snapshot von Name/Gym)
create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts on delete cascade,
  exercise_id uuid references public.exercises on delete set null,
  name text not null,
  gym text,
  note text,
  position int default 0
);

-- Sätze
create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises on delete cascade,
  weight numeric,
  reps int,
  position int default 0
);

-- Ernährung
do $$ begin
  create type public.meal_type as enum ('breakfast','lunch','dinner','snack');
exception when duplicate_object then null; end $$;

create table if not exists public.nutrition_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  meal public.meal_type not null,
  name text not null,
  kcal int, protein int, fat int, carbs int,
  source text default 'manual',     -- manual | ai | favorite
  created_at timestamptz default now()
);

-- Favoriten (Schnell-hinzufügen)
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  kcal int, protein int, fat int, carbs int
);

-- Tageskontext (aus Coros / Waage / manuell)
create table if not exists public.daily_context (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  sleep_hours numeric,
  hrv int,
  resting_hr int,
  activity_kcal int,
  stress text,          -- niedrig | mittel | hoch
  weight_kg numeric,    -- Arboleaf
  source text,
  primary key (user_id, date)
);

-- Trainingsplan (Wochenraster)
create table if not exists public.training_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  weekday int not null check (weekday between 0 and 6),  -- 0 = Montag
  discipline text not null,   -- swim|bike|run|strength|mobility|rest
  detail text,
  position int default 0
);

-- Wettkämpfe / Ziele
create table if not exists public.races (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  date date not null,
  location text
);

-- ============================================================
-- Indizes (häufige Zugriffsmuster)
-- ============================================================
create index if not exists idx_workouts_user_date on public.workouts (user_id, date);
create index if not exists idx_nutrition_user_date on public.nutrition_entries (user_id, date);
create index if not exists idx_exercises_user on public.exercises (user_id);
create index if not exists idx_we_workout on public.workout_exercises (workout_id);
create index if not exists idx_sets_we on public.sets (workout_exercise_id);
create index if not exists idx_plan_user on public.training_plan (user_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profile            enable row level security;
alter table public.exercises          enable row level security;
alter table public.workouts           enable row level security;
alter table public.workout_exercises  enable row level security;
alter table public.sets               enable row level security;
alter table public.nutrition_entries  enable row level security;
alter table public.favorites          enable row level security;
alter table public.daily_context      enable row level security;
alter table public.training_plan      enable row level security;
alter table public.races              enable row level security;

-- Direkte user_id-Tabellen: Besitzer-Policy
create policy "own_profile" on public.profile
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own_exercises" on public.exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_workouts" on public.workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_nutrition" on public.nutrition_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_favorites" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_daily_context" on public.daily_context
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_training_plan" on public.training_plan
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_races" on public.races
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- workout_exercises / sets haben keine user_id → über Join auf workouts prüfen
create policy "own_workout_exercises" on public.workout_exercises
  for all using (
    exists (select 1 from public.workouts w
            where w.id = workout_exercises.workout_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workouts w
            where w.id = workout_exercises.workout_id and w.user_id = auth.uid())
  );

create policy "own_sets" on public.sets
  for all using (
    exists (select 1 from public.workout_exercises we
            join public.workouts w on w.id = we.workout_id
            where we.id = sets.workout_exercise_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workout_exercises we
            join public.workouts w on w.id = we.workout_id
            where we.id = sets.workout_exercise_id and w.user_id = auth.uid())
  );

-- ============================================================
-- Auto-Profil bei Registrierung
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profile (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
