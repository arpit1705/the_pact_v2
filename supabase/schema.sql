-- ============================================================
-- THE PACT v2 — Supabase Schema (Group / N-person Pact model)
-- Run this in the Supabase SQL editor on a fresh project.
-- ============================================================

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- One row per authenticated user. Created on first sign-in via trigger.
-- pact_id FK added after pacts table exists (circular reference).
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  emoji       text not null default '💪',
  pact_id     uuid,
  created_at  timestamptz not null default now()
);

-- ─── pacts ───────────────────────────────────────────────────────────────────
-- A pact is a group of 2+ people holding each other accountable.
create table public.pacts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default 'The Pact',
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);

-- Now add the FK from profiles -> pacts (resolves circular reference)
alter table public.profiles
  add constraint profiles_pact_id_fkey
  foreign key (pact_id) references public.pacts(id) on delete set null;

-- ─── pact_members ────────────────────────────────────────────────────────────
-- Junction table: many users can belong to one pact.
create table public.pact_members (
  pact_id    uuid not null references public.pacts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('creator', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (pact_id, user_id)
);

-- ─── pact_invites ────────────────────────────────────────────────────────────
create table public.pact_invites (
  id            uuid primary key default gen_random_uuid(),
  pact_id       uuid references public.pacts(id) on delete cascade,
  from_user_id  uuid not null references public.profiles(id) on delete cascade,
  to_user_id    uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at    timestamptz not null default now()
);

-- ─── workout_logs ─────────────────────────────────────────────────────────────
create table public.workout_logs (
  id                      uuid primary key default gen_random_uuid(),
  pact_id                 uuid not null references public.pacts(id) on delete cascade,
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
  unique (pact_id, user_id, date)
);

-- ─── punishment_counts ────────────────────────────────────────────────────────
create table public.punishment_counts (
  pact_id         uuid not null references public.pacts(id) on delete cascade,
  debtor_user_id  uuid not null references public.profiles(id) on delete cascade,
  punishment_key  text not null,
  total           int not null default 0,
  resolved        int not null default 0,
  primary key (pact_id, debtor_user_id, punishment_key)
);

-- ─── user_treats ─────────────────────────────────────────────────────────────
-- Each user defines up to 6 treats they EARN when another pact member misses a workout.
create table public.user_treats (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  key         text not null,
  name        text not null,
  description text not null default '',
  details     text not null default '',
  emoji       text not null default '🎁',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, key)
);

-- ─── resolution_events ────────────────────────────────────────────────────────
create table public.resolution_events (
  id               uuid primary key default gen_random_uuid(),
  pact_id          uuid not null references public.pacts(id) on delete cascade,
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
-- Returns the auth user id for a given email (used during invites).
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
-- RPC: create_pact
-- Creates a new pact with the caller as the first member (creator).
-- ============================================================
create or replace function public.create_pact(pact_name text default 'The Pact')
returns uuid language plpgsql security definer as $$
declare
  v_pact_id uuid;
begin
  insert into public.pacts (name, created_by)
  values (pact_name, auth.uid())
  returning id into v_pact_id;

  insert into public.pact_members (pact_id, user_id, role)
  values (v_pact_id, auth.uid(), 'creator');

  update public.profiles set pact_id = v_pact_id
  where id = auth.uid();

  return v_pact_id;
end;
$$;

-- ============================================================
-- RPC: accept_pact_invite
-- Atomically accepts a pending invite and adds user to the pact.
-- ============================================================
create or replace function public.accept_pact_invite(invite_id uuid)
returns void language plpgsql security definer as $$
declare
  v_inv   public.pact_invites%rowtype;
begin
  select * into v_inv from public.pact_invites
  where id = invite_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Invite not found or already processed';
  end if;

  if v_inv.to_user_id != auth.uid() then
    raise exception 'Not authorised to accept this invite';
  end if;

  update public.pact_invites set status = 'accepted' where id = invite_id;

  insert into public.pact_members (pact_id, user_id, role)
  values (v_inv.pact_id, v_inv.to_user_id, 'member')
  on conflict do nothing;

  update public.profiles set pact_id = v_inv.pact_id
  where id = v_inv.to_user_id;
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles           enable row level security;
alter table public.pacts              enable row level security;
alter table public.pact_members       enable row level security;
alter table public.pact_invites       enable row level security;
alter table public.workout_logs       enable row level security;
alter table public.punishment_counts  enable row level security;
alter table public.resolution_events  enable row level security;

-- ── profiles ──────────────────────────────────────────────────────────────────
create policy "profiles: anyone can read"
  on public.profiles for select using (true);

create policy "profiles: own update"
  on public.profiles for update using (auth.uid() = id);

create policy "profiles: own insert"
  on public.profiles for insert with check (auth.uid() = id);

-- ── pacts ─────────────────────────────────────────────────────────────────────
create policy "pacts: members only"
  on public.pacts for select
  using (
    exists (
      select 1 from public.pact_members
      where pact_members.pact_id = id
        and pact_members.user_id = auth.uid()
    )
  );

-- ── Helper function: is the calling user in a given pact? ────────────────────
create or replace function public.is_pact_member(pid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.pact_members
    where pact_id = pid and user_id = auth.uid()
  );
$$;

-- ── pact_members ──────────────────────────────────────────────────────────────
create policy "pact_members: members can see co-members"
  on public.pact_members for select
  using (public.is_pact_member(pact_id));

-- ── pact_invites ──────────────────────────────────────────────────────────────
create policy "invites: sender or recipient"
  on public.pact_invites for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "invites: authenticated insert"
  on public.pact_invites for insert
  with check (auth.uid() = from_user_id);

-- ── workout_logs ──────────────────────────────────────────────────────────────
create policy "logs: pact members"
  on public.workout_logs for select
  using (public.is_pact_member(pact_id));

create policy "logs: insert own"
  on public.workout_logs for insert
  with check (auth.uid() = user_id and public.is_pact_member(pact_id));

create policy "logs: update own"
  on public.workout_logs for update
  using (auth.uid() = user_id or public.is_pact_member(pact_id));

-- ── punishment_counts ─────────────────────────────────────────────────────────
create policy "counts: pact members"
  on public.punishment_counts for select
  using (public.is_pact_member(pact_id));

create policy "counts: pact members upsert"
  on public.punishment_counts for insert
  with check (public.is_pact_member(pact_id));

create policy "counts: pact members update"
  on public.punishment_counts for update
  using (public.is_pact_member(pact_id));

-- ── resolution_events ─────────────────────────────────────────────────────────
create policy "resolutions: pact members"
  on public.resolution_events for select
  using (public.is_pact_member(pact_id));

create policy "resolutions: pact members insert"
  on public.resolution_events for insert
  with check (public.is_pact_member(pact_id));

-- ── Storage: workout_photos ───────────────────────────────────────────────────
create policy "photos: public read"
  on storage.objects for select
  using (bucket_id = 'workout_photos');

create policy "photos: auth upload"
  on storage.objects for insert
  with check (bucket_id = 'workout_photos' and auth.role() = 'authenticated');

-- ── user_treats ─────────────────────────────────────────────────────────────
alter table public.user_treats enable row level security;

create policy "treats: anyone can read"
  on public.user_treats for select using (true);

create policy "treats: own insert"
  on public.user_treats for insert
  with check (auth.uid() = user_id);

create policy "treats: own update"
  on public.user_treats for update
  using (auth.uid() = user_id);

create policy "treats: own delete"
  on public.user_treats for delete
  using (auth.uid() = user_id);
