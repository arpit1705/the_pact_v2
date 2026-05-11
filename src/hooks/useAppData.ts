import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePact } from '@/context/PactContext';
import type { WorkoutLog, TreatCounts, ResolutionEvent, UserTreat, TreatOption } from '@/types';

// ─── DB row types ─────────────────────────────────────────────────────────────

interface DbWorkoutLog {
  id: string;
  user_id: string;
  pact_id: string;
  date: string;
  status: 'done' | 'missed' | 'forgiven';
  notes: string | null;
  photo_url: string | null;
  punishment_selected: string | null;
  punishment_resolved_at: string | null;
  mutual_miss: boolean;
  forgiven_by: string | null;
  created_at: string;
}

interface DbTreatCount {
  pact_id: string;
  debtor_user_id: string;
  punishment_key: string;
  total: number;
  resolved: number;
}

interface DbResolutionEvent {
  id: string;
  pact_id: string;
  debtor_user_id: string;
  punishment_type: string;
  resolved_by: string;
  resolved_at: string;
}

interface DbUserTreat {
  id: string;
  user_id: string;
  key: string;
  name: string;
  description: string;
  details: string;
  emoji: string;
  sort_order: number;
  created_at: string;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function toWorkoutLog(row: DbWorkoutLog): WorkoutLog {
  return {
    id: row.id,
    userId: row.user_id,
    pactId: row.pact_id,
    date: row.date,
    status: row.status,
    notes: row.notes ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    treatSelected: row.punishment_selected,
    treatResolvedAt: row.punishment_resolved_at,
    mutualMiss: row.mutual_miss,
    forgivenBy: row.forgiven_by,
  };
}

function toResolutionEvent(row: DbResolutionEvent): ResolutionEvent {
  return {
    id: row.id,
    pactId: row.pact_id,
    debtorUserId: row.debtor_user_id,
    treatType: row.punishment_type,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at.split('T')[0],
  };
}

function toTreatCounts(rows: DbTreatCount[]): TreatCounts {
  const result: TreatCounts = {};
  for (const row of rows) {
    if (!result[row.debtor_user_id]) result[row.debtor_user_id] = {};
    result[row.debtor_user_id][row.punishment_key] = {
      total: row.total,
      resolved: row.resolved,
    };
  }
  return result;
}

function toUserTreat(row: DbUserTreat): UserTreat {
  return {
    id: row.id,
    userId: row.user_id,
    key: row.key,
    name: row.name,
    description: row.description,
    details: row.details,
    emoji: row.emoji,
    sortOrder: row.sort_order,
  };
}

function toTreatOption(ut: UserTreat): TreatOption {
  return { key: ut.key, name: ut.name, description: ut.description, details: ut.details, emoji: ut.emoji };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAppData() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { pactId, members } = usePact();

  const myId = user?.id ?? '';
  const allMemberIds = [myId, ...members.map(m => m.id)].filter(Boolean);

  const KEYS = {
    workoutLogs: ['workout_logs', pactId] as const,
    treatCounts: ['punishment_counts', pactId] as const,
    resolutionLog: ['resolution_events', pactId] as const,
    userTreats: ['user_treats', pactId, ...allMemberIds] as const,
  };

  const { data: workoutLogs = [] } = useQuery({
    queryKey: KEYS.workoutLogs,
    enabled: !!pactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('pact_id', pactId)
        .order('date', { ascending: false });
      if (error) throw error;
      return (data as DbWorkoutLog[]).map(toWorkoutLog);
    },
  });

  const { data: treatCounts = {} } = useQuery({
    queryKey: KEYS.treatCounts,
    enabled: !!pactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('punishment_counts')
        .select('*')
        .eq('pact_id', pactId);
      if (error) throw error;
      return toTreatCounts(data as DbTreatCount[]);
    },
  });

  const { data: resolutionLog = [] } = useQuery({
    queryKey: KEYS.resolutionLog,
    enabled: !!pactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resolution_events')
        .select('*')
        .eq('pact_id', pactId)
        .order('resolved_at', { ascending: false });
      if (error) throw error;
      return (data as DbResolutionEvent[]).map(toResolutionEvent);
    },
  });

  const { data: userTreats = [] } = useQuery({
    queryKey: KEYS.userTreats,
    enabled: allMemberIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_treats')
        .select('*')
        .in('user_id', allMemberIds)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data as DbUserTreat[]).map(toUserTreat);
    },
  });

  const getMyTreats = useCallback(
    (): UserTreat[] => userTreats.filter(t => t.userId === myId),
    [userTreats, myId],
  );

  const getTreatsForUser = useCallback(
    (userId: string): TreatOption[] =>
      userTreats.filter(t => t.userId === userId).map(toTreatOption),
    [userTreats],
  );

  const getMyTreatOptions = useCallback(
    (): TreatOption[] =>
      userTreats.filter(t => t.userId === myId).map(toTreatOption),
    [userTreats, myId],
  );

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addWorkoutLogMutation = useMutation({
    mutationFn: async (log: Omit<WorkoutLog, 'id'>): Promise<WorkoutLog> => {
      let mutualMiss = false;

      // In a group pact, "mutual miss" means ALL other members also missed
      // on the same day (no treats owed when everyone fails).
      if (log.status === 'missed' && members.length > 0) {
        const otherIds = members.map(m => m.id);
        const { data: otherLogs } = await supabase
          .from('workout_logs')
          .select('id, user_id')
          .eq('pact_id', pactId)
          .in('user_id', otherIds)
          .eq('date', log.date)
          .eq('status', 'missed')
          .is('punishment_selected', null)
          .eq('mutual_miss', false);

        const missedIds = new Set((otherLogs ?? []).map(l => l.user_id));
        if (otherIds.every(id => missedIds.has(id))) {
          mutualMiss = true;
          const idsToUpdate = (otherLogs ?? []).map(l => l.id);
          if (idsToUpdate.length > 0) {
            await supabase
              .from('workout_logs')
              .update({ mutual_miss: true })
              .in('id', idsToUpdate);
          }
        }
      }

      const { data, error } = await supabase
        .from('workout_logs')
        .insert({
          user_id: log.userId,
          pact_id: pactId,
          date: log.date,
          status: log.status,
          notes: log.notes ?? null,
          photo_url: log.photoUrl ?? null,
          punishment_selected: log.treatSelected,
          punishment_resolved_at: log.treatResolvedAt,
          mutual_miss: mutualMiss,
        })
        .select()
        .single();

      if (error) throw error;
      return toWorkoutLog(data as DbWorkoutLog);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.workoutLogs }),
  });

  const updateWorkoutLogMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<WorkoutLog> }) => {
      const dbUpdates: Partial<DbWorkoutLog> = {};
      if (updates.date !== undefined) dbUpdates.date = updates.date;
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes ?? null;
      if (updates.photoUrl !== undefined) dbUpdates.photo_url = updates.photoUrl ?? null;
      if (updates.treatSelected !== undefined) dbUpdates.punishment_selected = updates.treatSelected;
      if (updates.treatResolvedAt !== undefined) dbUpdates.punishment_resolved_at = updates.treatResolvedAt;
      if (updates.mutualMiss !== undefined) dbUpdates.mutual_miss = updates.mutualMiss;
      if (updates.forgivenBy !== undefined) dbUpdates.forgiven_by = updates.forgivenBy;

      const { error } = await supabase
        .from('workout_logs')
        .update(dbUpdates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.workoutLogs }),
  });

  const incrementTreatMutation = useMutation({
    mutationFn: async ({ userId, treatKey }: { userId: string; treatKey: string }) => {
      const { data: existing } = await supabase
        .from('punishment_counts')
        .select('total, resolved')
        .eq('pact_id', pactId)
        .eq('debtor_user_id', userId)
        .eq('punishment_key', treatKey)
        .maybeSingle();

      const { error } = await supabase
        .from('punishment_counts')
        .upsert(
          {
            pact_id: pactId,
            debtor_user_id: userId,
            punishment_key: treatKey,
            total: (existing?.total ?? 0) + 1,
            resolved: existing?.resolved ?? 0,
          },
          { onConflict: 'pact_id,debtor_user_id,punishment_key' },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.treatCounts }),
  });

  const resolveTreatMutation = useMutation({
    mutationFn: async ({
      debtorUserId,
      treatKey,
      resolvedByUserId,
    }: {
      debtorUserId: string;
      treatKey: string;
      resolvedByUserId: string;
    }) => {
      const { data: current } = await supabase
        .from('punishment_counts')
        .select('total, resolved')
        .eq('pact_id', pactId)
        .eq('debtor_user_id', debtorUserId)
        .eq('punishment_key', treatKey)
        .single();

      if (current) {
        const { error: countError } = await supabase
          .from('punishment_counts')
          .update({ resolved: current.resolved + 1 })
          .eq('pact_id', pactId)
          .eq('debtor_user_id', debtorUserId)
          .eq('punishment_key', treatKey);
        if (countError) throw countError;
      }

      const { data: targetLog } = await supabase
        .from('workout_logs')
        .select('id')
        .eq('pact_id', pactId)
        .eq('user_id', debtorUserId)
        .eq('punishment_selected', treatKey)
        .is('punishment_resolved_at', null)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (targetLog) {
        const { error: logError } = await supabase
          .from('workout_logs')
          .update({ punishment_resolved_at: new Date().toISOString() })
          .eq('id', targetLog.id);
        if (logError) throw logError;
      }

      const { error: eventError } = await supabase
        .from('resolution_events')
        .insert({
          pact_id: pactId,
          debtor_user_id: debtorUserId,
          punishment_type: treatKey,
          resolved_by: resolvedByUserId,
          resolved_at: new Date().toISOString(),
        });
      if (eventError) throw eventError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.treatCounts });
      qc.invalidateQueries({ queryKey: KEYS.workoutLogs });
      qc.invalidateQueries({ queryKey: KEYS.resolutionLog });
    },
  });

  const saveTreatMutation = useMutation({
    mutationFn: async (treat: Omit<UserTreat, 'id' | 'sortOrder'> & { id?: string; sortOrder?: number }) => {
      if (treat.id) {
        const { error } = await supabase
          .from('user_treats')
          .update({
            name: treat.name,
            description: treat.description,
            details: treat.details,
            emoji: treat.emoji,
            key: treat.key,
          })
          .eq('id', treat.id);
        if (error) throw error;
      } else {
        const currentCount = userTreats.filter(t => t.userId === treat.userId).length;
        const { error } = await supabase
          .from('user_treats')
          .insert({
            user_id: treat.userId,
            key: treat.key,
            name: treat.name,
            description: treat.description,
            details: treat.details,
            emoji: treat.emoji,
            sort_order: currentCount,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.userTreats }),
  });

  const deleteTreatMutation = useMutation({
    mutationFn: async (treatId: string) => {
      const { error } = await supabase.from('user_treats').delete().eq('id', treatId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.userTreats }),
  });

  // ── Stable action wrappers ────────────────────────────────────────────────

  const addWorkoutLog = useCallback(
    (log: Omit<WorkoutLog, 'id'>) => addWorkoutLogMutation.mutateAsync(log),
    [addWorkoutLogMutation],
  );

  const updateWorkoutLog = useCallback(
    (id: string, updates: Partial<WorkoutLog>) =>
      updateWorkoutLogMutation.mutateAsync({ id, updates }),
    [updateWorkoutLogMutation],
  );

  const incrementTreat = useCallback(
    (userId: string, treatKey: string) =>
      incrementTreatMutation.mutate({ userId, treatKey }),
    [incrementTreatMutation],
  );

  const resolveTreat = useCallback(
    (debtorUserId: string, treatKey: string, resolvedByUserId: string) =>
      resolveTreatMutation.mutate({ debtorUserId, treatKey, resolvedByUserId }),
    [resolveTreatMutation],
  );

  const saveTreat = useCallback(
    (treat: Omit<UserTreat, 'id' | 'sortOrder'> & { id?: string; sortOrder?: number }) =>
      saveTreatMutation.mutateAsync(treat),
    [saveTreatMutation],
  );

  const deleteTreat = useCallback(
    (treatId: string) => deleteTreatMutation.mutateAsync(treatId),
    [deleteTreatMutation],
  );

  // ── Computed helpers ──────────────────────────────────────────────────────

  const getStreakForUser = useCallback(
    (userId: string): number => {
      const userLogs = workoutLogs
        .filter(l => l.userId === userId)
        .sort((a, b) => b.date.localeCompare(a.date));

      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 60; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const log = userLogs.find(l => l.date === dateStr);
        if (log?.status === 'done') streak++;
        else if (log?.status === 'missed') break;
        else if (i === 0) continue;
        else break;
      }
      return streak;
    },
    [workoutLogs],
  );

  const getTodayStatus = useCallback(
    (userId: string): 'done' | 'missed' | 'forgiven' | 'not-logged' => {
      const today = new Date().toISOString().split('T')[0];
      const log = workoutLogs.find(l => l.userId === userId && l.date === today);
      return log?.status ?? 'not-logged';
    },
    [workoutLogs],
  );

  const getMonthlyCount = useCallback(
    (userId: string): { done: number; total: number } => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const userLogs = workoutLogs.filter(l => {
        const d = new Date(l.date);
        return l.userId === userId && d.getFullYear() === year && d.getMonth() === month;
      });
      return { done: userLogs.filter(l => l.status === 'done').length, total: now.getDate() };
    },
    [workoutLogs],
  );

  const getTotalTreats = useCallback(
    (userId: string): number => {
      const userTreatKeys = new Set(userTreats.filter(t => t.userId === userId).map(t => t.key));
      let total = 0;
      for (const [debtorId, counts] of Object.entries(treatCounts)) {
        if (debtorId === userId) continue;
        for (const [key, c] of Object.entries(counts)) {
          if (userTreatKeys.has(key)) total += c.total - c.resolved;
        }
      }
      return total;
    },
    [treatCounts, userTreats],
  );

  const getPendingMissedLogs = useCallback(
    (userId: string): WorkoutLog[] =>
      workoutLogs.filter(
        l => l.userId === userId && l.status === 'missed' && l.treatSelected === null && !l.mutualMiss,
      ),
    [workoutLogs],
  );

  const getMemberProfile = useCallback(
    (userId: string): { name: string; emoji: string } | undefined => {
      if (userId === myId) return { name: user?.user_metadata?.name ?? '', emoji: '💪' };
      const m = members.find(m => m.id === userId);
      return m ? { name: m.name, emoji: m.emoji } : undefined;
    },
    [myId, members, user],
  );

  return {
    workoutLogs,
    treatCounts,
    resolutionLog,
    userTreats,
    addWorkoutLog,
    updateWorkoutLog,
    incrementTreat,
    resolveTreat,
    saveTreat,
    deleteTreat,
    getPendingMissedLogs,
    getStreakForUser,
    getTodayStatus,
    getMonthlyCount,
    getTotalTreats,
    getMyTreats,
    getMyTreatOptions,
    getTreatsForUser,
    getMemberProfile,
    currentUserId: user?.id ?? null,
  };
}
