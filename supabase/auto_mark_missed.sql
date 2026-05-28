-- ============================================================
-- RPC: auto_mark_missed
-- Marks un-logged days as 'missed' for ALL members of a pact, so a
-- member who never opens the app still gets held accountable when any
-- co-member opens it.
--
-- Window: days from (today - 7) through (today - 2) inclusive — i.e.
-- only days whose 48h grace has fully elapsed. Today and yesterday are
-- left alone.
--
-- SECURITY DEFINER so it can insert rows on behalf of other members
-- (the "logs: insert own" RLS policy only allows self-inserts). The
-- caller must themselves be a member of the pact, enforced below.
--
-- Idempotent: relies on the existing unique (pact_id, user_id, date)
-- constraint + ON CONFLICT DO NOTHING, so concurrent callers and repeat
-- calls never create duplicates.
--
-- Newly inserted rows start with punishment_selected = null and
-- mutual_miss = false. A second pass then flags mutual misses: any date
-- (in window) where EVERY member missed and no treat has been assigned
-- yet gets mutual_miss = true on all those rows — mirroring the client
-- mutual-miss rule in addWorkoutLogMutation (no treats owed when the
-- whole pact fails the same day).
-- ============================================================
create or replace function public.auto_mark_missed(p_pact_id uuid)
returns void language plpgsql security definer as $$
declare
  v_member_count int;
begin
  -- Caller must be a member of this pact.
  if not public.is_pact_member(p_pact_id) then
    raise exception 'Not authorised for this pact';
  end if;

  insert into public.workout_logs (pact_id, user_id, date, status, mutual_miss)
  select p_pact_id, m.user_id, d::date, 'missed', false
  from public.pact_members m
  cross join generate_series(
    (current_date - interval '7 days'),
    (current_date - interval '2 days'),
    interval '1 day'
  ) as d
  where m.pact_id = p_pact_id
  on conflict (pact_id, user_id, date) do nothing;

  -- Mutual-miss pass: flag dates in the window where ALL members missed
  -- and none of those misses has a treat assigned yet.
  select count(*) into v_member_count
  from public.pact_members where pact_id = p_pact_id;

  update public.workout_logs wl
  set mutual_miss = true
  where wl.pact_id = p_pact_id
    and wl.date >= (current_date - interval '7 days')
    and wl.date <= (current_date - interval '2 days')
    and wl.status = 'missed'
    and wl.mutual_miss = false
    and wl.date in (
      select date
      from public.workout_logs
      where pact_id = p_pact_id
        and status = 'missed'
        and punishment_selected is null
        and date >= (current_date - interval '7 days')
        and date <= (current_date - interval '2 days')
      group by date
      having count(*) = v_member_count
    );
end;
$$;

grant execute on function public.auto_mark_missed(uuid) to authenticated;
