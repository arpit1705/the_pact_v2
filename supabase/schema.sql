-- ============================================================
-- THE PACT v2 — Supabase Schema
-- Run this in the Supabase SQL editor on a fresh project.
-- ============================================================

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- One row per authenticated user. Created on first sign-in via trigger.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  emoji       text not null default '💪',
  couple_id   uuid references public.couples(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ─── couples ──────────────────────────────────────────────────────────────────
-- partner1_id is whichever partner signed up first / sent the request.
-- This ordering is used for treat-list assignment (stable, never changes).
create table public.couples (
  id           uuid primary key default gen_random_uuid(),
  partner1_id  uuid not null references public.profiles(id) on delete cascade,
  partner2_id  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (partner1_id, partner2_id)
);

-- couple_id FK in profiles references couples — need to add it after couples exists
-- (handled by the forward reference above; Postgres allows this via deferred constraints)

-- ─── couple_requests ──────────────────────────────────────────────────────────
create table public.couple_requests (
  id            uuid primary key default gen_random_uuid(),
  from_user_id  uuid not null references public.profiles(id) on delete cascade,
  to_user_id    uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at    timestamptz not null default now()
);

-- ─── workout_logs ─────────────────────────────────────────────────────────────
create table public.workout_logs (
  id                      uuid primary key default gen_random_uuid(),
  couple_id               uuid not null references public.couples(id) on delete cascade,
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  date                    date not null,
  status                  text not null check (status in ('done', 'missed', 'forgiven')),
  notes                   text,
  photo_url               text,
  punishment_selected     text,
  punishment_resolved_at  timestamptz,
  mutual_miss             boolean not null default false,
  forgiven_by             uuid references public.profiles(id),
  created_at              timestamptz not null default now(),
  unique (couple_id, user_id, date)
);

-- ─── punishment_counts ────────────────────────────────────────────────────────
create table public.punishment_counts (
  couple_id       uuid not null references public.couples(id) on delete cascade,
  debtor_user_id  uuid not null references public.profiles(id) on delete cascade,
  punishment_key  text not null,
  total           int not null default 0,
  resolved        int not null default 0,
  primary key (couple_id, debtor_user_id, punishment_key)
);

-- ─── resolution_events ────────────────────────────────────────────────────────
create table public.resolution_events (
  id               uuid primary key default gen_random_uuid(),
  couple_id        uuid not null references public.couples(id) on delete cascade,
  debtor_user_id   uuid not null references public.profiles(id) on delete cascade,
  punishment_type  text not null,
  resolved_by      uuid not null references public.profiles(id),
  resolved_at      timestamptz not null default now()
);

-- ─── Storage bucket ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('workout_photos', 'workout_photos', true)
on conflict do nothing;

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGN-UP
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, emoji)
  values (new.id, '', '💪')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- RPC: find_user_by_email
-- Returns the auth user id for a given email (used during pairing).
-- SECURITY DEFINER so it can read auth.users.
-- ============================================================
create or replace function public.find_user_by_email(email text)
returns uuid language plpgsql security definer as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(auth.users.email) = lower(find_user_by_email.email);
  return v_id;
end;
$$;

-- ============================================================
-- RPC: accept_couple_request
-- Atomically accepts a pending request, creates the couple row,
-- and stamps couple_id on both profiles.
-- ============================================================
create or replace function public.accept_couple_request(request_id uuid)
returns void language plpgsql security definer as $$
declare
  v_req       public.couple_requests%rowtype;
  v_couple_id uuid;
begin
  -- Fetch and validate the request
  select * into v_req from public.couple_requests
  where id = request_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Request not found or already processed';
  end if;

  -- Only the intended recipient can accept
  if v_req.to_user_id != auth.uid() then
    raise exception 'Not authorised to accept this request';
  end if;

  -- Mark accepted
  update public.couple_requests set status = 'accepted' where id = request_id;

  -- Create couple (sender = partner1)
  insert into public.couples (partner1_id, partner2_id)
  values (v_req.from_user_id, v_req.to_user_id)
  returning id into v_couple_id;

  -- Stamp both profiles
  update public.profiles set couple_id = v_couple_id
  where id in (v_req.from_user_id, v_req.to_user_id);
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles           enable row level security;
alter table public.couples            enable row level security;
alter table public.couple_requests    enable row level security;
alter table public.workout_logs       enable row level security;
alter table public.punishment_counts  enable row level security;
alter table public.resolution_events  enable row level security;

-- ── profiles ──────────────────────────────────────────────────────────────────
-- Anyone can read any profile (needed for partner lookup by name/emoji).
create policy "profiles: anyone can read"
  on public.profiles for select using (true);

-- Users can only update their own profile.
create policy "profiles: own update"
  on public.profiles for update using (auth.uid() = id);

-- Insert handled by trigger (security definer), but allow explicit upsert too.
create policy "profiles: own insert"
  on public.profiles for insert with check (auth.uid() = id);

-- ── couples ───────────────────────────────────────────────────────────────────
-- Only members of a couple can see it.
create policy "couples: members only"
  on public.couples for select
  using (auth.uid() = partner1_id or auth.uid() = partner2_id);

-- Inserts done via accept_couple_request (security definer) — no direct insert needed.

-- ── couple_requests ───────────────────────────────────────────────────────────
create policy "requests: sender or recipient"
  on public.couple_requests for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "requests: authenticated insert"
  on public.couple_requests for insert
  with check (auth.uid() = from_user_id);

-- ── Helper function: is the calling user in a given couple? ──────────────────
create or replace function public.is_couple_member(cid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.couples
    where id = cid
      and (partner1_id = auth.uid() or partner2_id = auth.uid())
  );
$$;

-- ── workout_logs ──────────────────────────────────────────────────────────────
create policy "logs: couple members"
  on public.workout_logs for select
  using (public.is_couple_member(couple_id));

create policy "logs: insert own"
  on public.workout_logs for insert
  with check (auth.uid() = user_id and public.is_couple_member(couple_id));

create policy "logs: update own"
  on public.workout_logs for update
  using (auth.uid() = user_id or public.is_couple_member(couple_id));

-- ── punishment_counts ─────────────────────────────────────────────────────────
create policy "counts: couple members"
  on public.punishment_counts for select
  using (public.is_couple_member(couple_id));

create policy "counts: couple members upsert"
  on public.punishment_counts for insert
  with check (public.is_couple_member(couple_id));

create policy "counts: couple members update"
  on public.punishment_counts for update
  using (public.is_couple_member(couple_id));

-- ── resolution_events ─────────────────────────────────────────────────────────
create policy "resolutions: couple members"
  on public.resolution_events for select
  using (public.is_couple_member(couple_id));

create policy "resolutions: couple members insert"
  on public.resolution_events for insert
  with check (public.is_couple_member(couple_id));

-- ── Storage: workout_photos ───────────────────────────────────────────────────
-- Bucket is public (read). Write restricted to authenticated users.
create policy "photos: public read"
  on storage.objects for select
  using (bucket_id = 'workout_photos');

create policy "photos: auth upload"
  on storage.objects for insert
  with check (bucket_id = 'workout_photos' and auth.role() = 'authenticated');
