-- ============================================================
-- MIGRATION: Couple Model → Group Pact Model
-- ============================================================
-- This migrates the existing couple-based schema to the new
-- N-person pact model. Existing data is preserved and migrated.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================

BEGIN;

-- ─── 1. Create new tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL DEFAULT 'The Pact',
  created_by   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pact_members (
  pact_id    uuid NOT NULL REFERENCES public.pacts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('creator', 'member')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pact_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.pact_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id       uuid REFERENCES public.pacts(id) ON DELETE CASCADE,
  from_user_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Migrate data: couples → pacts + pact_members ───────────────────────────

INSERT INTO public.pacts (id, name, created_by, created_at)
SELECT id, 'The Pact', partner1_id, created_at
FROM public.couples
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pact_members (pact_id, user_id, role, joined_at)
SELECT id, partner1_id, 'creator', created_at FROM public.couples
ON CONFLICT DO NOTHING;

INSERT INTO public.pact_members (pact_id, user_id, role, joined_at)
SELECT id, partner2_id, 'member', created_at FROM public.couples
ON CONFLICT DO NOTHING;

-- ─── 3. Migrate data: couple_requests → pact_invites ────────────────────────────

INSERT INTO public.pact_invites (id, pact_id, from_user_id, to_user_id, status, created_at)
SELECT
  cr.id,
  p.couple_id,        -- pact_id = the sender's existing couple/pact
  cr.from_user_id,
  cr.to_user_id,
  cr.status,
  cr.created_at
FROM public.couple_requests cr
LEFT JOIN public.profiles p ON p.id = cr.from_user_id
ON CONFLICT (id) DO NOTHING;

-- ─── 4. Rename couple_id → pact_id on profiles ─────────────────────────────────

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_couple_id_fkey;
ALTER TABLE public.profiles RENAME COLUMN couple_id TO pact_id;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pact_id_fkey
  FOREIGN KEY (pact_id) REFERENCES public.pacts(id) ON DELETE SET NULL;

-- ─── 5. Rename couple_id → pact_id on workout_logs ─────────────────────────────

ALTER TABLE public.workout_logs DROP CONSTRAINT IF EXISTS workout_logs_couple_id_fkey;
ALTER TABLE public.workout_logs RENAME COLUMN couple_id TO pact_id;
ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_pact_id_fkey
  FOREIGN KEY (pact_id) REFERENCES public.pacts(id) ON DELETE CASCADE;

-- Add unique constraint (prevents duplicate logs per user per day per pact)
ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_pact_id_user_id_date_key
  UNIQUE (pact_id, user_id, date);

-- ─── 6. Rename couple_id → pact_id on punishment_counts ─────────────────────────

ALTER TABLE public.punishment_counts DROP CONSTRAINT IF EXISTS punishment_counts_pkey;
ALTER TABLE public.punishment_counts DROP CONSTRAINT IF EXISTS punishment_counts_couple_id_fkey;
ALTER TABLE public.punishment_counts RENAME COLUMN couple_id TO pact_id;
ALTER TABLE public.punishment_counts
  ADD CONSTRAINT punishment_counts_pkey
  PRIMARY KEY (pact_id, debtor_user_id, punishment_key);
ALTER TABLE public.punishment_counts
  ADD CONSTRAINT punishment_counts_pact_id_fkey
  FOREIGN KEY (pact_id) REFERENCES public.pacts(id) ON DELETE CASCADE;

-- ─── 7. Rename couple_id → pact_id on resolution_events ────────────────────────

ALTER TABLE public.resolution_events DROP CONSTRAINT IF EXISTS resolution_events_couple_id_fkey;
ALTER TABLE public.resolution_events RENAME COLUMN couple_id TO pact_id;
ALTER TABLE public.resolution_events
  ADD CONSTRAINT resolution_events_pact_id_fkey
  FOREIGN KEY (pact_id) REFERENCES public.pacts(id) ON DELETE CASCADE;

-- ─── 8. Add unique constraint on user_treats (skip if already exists) ────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_treats_user_id_key_key'
  ) THEN
    ALTER TABLE public.user_treats ADD CONSTRAINT user_treats_user_id_key_key UNIQUE (user_id, key);
  END IF;
END $$;

-- ─── 9. Drop old tables ────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.couple_requests;
DROP TABLE IF EXISTS public.couples;

-- ─── 10. RPC: find_user_by_email ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.find_user_by_email(email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM auth.users
  WHERE lower(auth.users.email) = lower(find_user_by_email.email);
  RETURN v_id;
END;
$$;

-- ─── 11. RPC: create_pact ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_pact(pact_name text DEFAULT 'The Pact')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pact_id uuid;
BEGIN
  INSERT INTO public.pacts (name, created_by)
  VALUES (pact_name, auth.uid())
  RETURNING id INTO v_pact_id;

  INSERT INTO public.pact_members (pact_id, user_id, role)
  VALUES (v_pact_id, auth.uid(), 'creator');

  UPDATE public.profiles SET pact_id = v_pact_id
  WHERE id = auth.uid();

  RETURN v_pact_id;
END;
$$;

-- ─── 12. RPC: accept_pact_invite ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_pact_invite(invite_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv public.pact_invites%rowtype;
BEGIN
  SELECT * INTO v_inv
  FROM public.pact_invites
  WHERE id = invite_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already processed';
  END IF;

  IF v_inv.to_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorised to accept this invite';
  END IF;

  UPDATE public.pact_invites SET status = 'accepted' WHERE id = invite_id;

  INSERT INTO public.pact_members (pact_id, user_id, role)
  VALUES (v_inv.pact_id, v_inv.to_user_id, 'member')
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles SET pact_id = v_inv.pact_id
  WHERE id = v_inv.to_user_id;
END;
$$;

-- ─── 13. Helper: is_pact_member ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_pact_member(pid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pact_members
    WHERE pact_id = pid AND user_id = auth.uid()
  );
$$;

-- ─── 14. Auto-create profile on sign-up ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, emoji)
  VALUES (new.id, '', '💪')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─── 15. Row Level Security ────────────────────────────────────────────────────

-- Enable RLS on new tables
ALTER TABLE public.pacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pact_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pact_invites   ENABLE ROW LEVEL SECURITY;

-- Ensure RLS is on for existing tables (idempotent)
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punishment_counts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resolution_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_treats        ENABLE ROW LEVEL SECURITY;

-- ── profiles ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles: anyone can read"    ON public.profiles;
DROP POLICY IF EXISTS "profiles: own update"         ON public.profiles;
DROP POLICY IF EXISTS "profiles: own insert"         ON public.profiles;

CREATE POLICY "profiles: anyone can read"
  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles: own update"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles: own insert"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ── pacts ───────────────────────────────────────────────────────────────────────
CREATE POLICY "pacts: members only"
  ON public.pacts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.pact_members
    WHERE pact_members.pact_id = id AND pact_members.user_id = auth.uid()
  ));

-- ── pact_members ────────────────────────────────────────────────────────────────
CREATE POLICY "pact_members: members can see co-members"
  ON public.pact_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.pact_members pm
    WHERE pm.pact_id = pact_members.pact_id AND pm.user_id = auth.uid()
  ));

-- ── pact_invites ────────────────────────────────────────────────────────────────
CREATE POLICY "invites: sender or recipient"
  ON public.pact_invites FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
CREATE POLICY "invites: authenticated insert"
  ON public.pact_invites FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

-- ── workout_logs ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "logs: pact members"  ON public.workout_logs;
DROP POLICY IF EXISTS "logs: insert own"    ON public.workout_logs;
DROP POLICY IF EXISTS "logs: update own"    ON public.workout_logs;

CREATE POLICY "logs: pact members"
  ON public.workout_logs FOR SELECT
  USING (public.is_pact_member(pact_id));
CREATE POLICY "logs: insert own"
  ON public.workout_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_pact_member(pact_id));
CREATE POLICY "logs: update own"
  ON public.workout_logs FOR UPDATE
  USING (auth.uid() = user_id OR public.is_pact_member(pact_id));

-- ── punishment_counts ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "counts: pact members"        ON public.punishment_counts;
DROP POLICY IF EXISTS "counts: pact members upsert" ON public.punishment_counts;
DROP POLICY IF EXISTS "counts: pact members update" ON public.punishment_counts;

CREATE POLICY "counts: pact members"
  ON public.punishment_counts FOR SELECT
  USING (public.is_pact_member(pact_id));
CREATE POLICY "counts: pact members upsert"
  ON public.punishment_counts FOR INSERT
  WITH CHECK (public.is_pact_member(pact_id));
CREATE POLICY "counts: pact members update"
  ON public.punishment_counts FOR UPDATE
  USING (public.is_pact_member(pact_id));

-- ── resolution_events ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "resolutions: pact members"        ON public.resolution_events;
DROP POLICY IF EXISTS "resolutions: pact members insert" ON public.resolution_events;

CREATE POLICY "resolutions: pact members"
  ON public.resolution_events FOR SELECT
  USING (public.is_pact_member(pact_id));
CREATE POLICY "resolutions: pact members insert"
  ON public.resolution_events FOR INSERT
  WITH CHECK (public.is_pact_member(pact_id));

-- ── user_treats ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "treats: anyone can read" ON public.user_treats;
DROP POLICY IF EXISTS "treats: own insert"      ON public.user_treats;
DROP POLICY IF EXISTS "treats: own update"      ON public.user_treats;
DROP POLICY IF EXISTS "treats: own delete"      ON public.user_treats;

CREATE POLICY "treats: anyone can read"
  ON public.user_treats FOR SELECT USING (true);
CREATE POLICY "treats: own insert"
  ON public.user_treats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "treats: own update"
  ON public.user_treats FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "treats: own delete"
  ON public.user_treats FOR DELETE USING (auth.uid() = user_id);

-- ─── 16. Storage bucket ────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('workout_photos', 'workout_photos', true)
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "photos: public read"  ON storage.objects;
DROP POLICY IF EXISTS "photos: auth upload"  ON storage.objects;

CREATE POLICY "photos: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'workout_photos');
CREATE POLICY "photos: auth upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'workout_photos' AND auth.role() = 'authenticated');

-- ─── 17. Drop old RPC functions if they exist ──────────────────────────────────

DROP FUNCTION IF EXISTS public.accept_couple_request(uuid);

COMMIT;
