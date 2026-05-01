import { useMemo, useState } from 'react';
import type { WorkoutLog, TreatOption, ResolutionEvent } from '@/types';
import { LogWorkoutModal } from '@/components/LogWorkoutModal';
import { useAuth } from '@/context/AuthContext';
import { usePact } from '@/context/PactContext';
import type { AppData } from '@/pages/Dashboard';

interface HistoryProps {
  data: AppData;
}

type TimelineEvent =
  | { kind: 'workout'; log: WorkoutLog }
  | { kind: 'treat'; log: WorkoutLog; option: TreatOption }
  | { kind: 'resolution'; event: ResolutionEvent };

const getTreatOption = (key: string, treatsFromData: TreatOption[]) => treatsFromData.find(p => p.key === key);

export default function History({ data }: HistoryProps) {
  const { user, profile } = useAuth();
  const { members } = usePact();
  const [userFilter, setUserFilter] = useState<string>('all');
  const [eventFilter, setEventFilter] = useState<'all' | 'workouts' | 'treats' | 'resolutions' | 'passed'>('all');
  const [editingLog, setEditingLog] = useState<string | null>(null);

  const myId = user?.id ?? '';

  const memberMap = useMemo(() => {
    const map: Record<string, { name: string; emoji: string }> = {};
    if (profile) map[myId] = { name: profile.name, emoji: profile.emoji };
    members.forEach(m => { map[m.id] = { name: m.name, emoji: m.emoji }; });
    return map;
  }, [myId, profile, members]);

  const allMemberIds = useMemo(() => [myId, ...members.map(m => m.id)], [myId, members]);

  const allDynTreats = useMemo(() => {
    return allMemberIds.flatMap(id => data.getTreatsForUser(id));
  }, [data, allMemberIds]);

  const now = new Date();
  const currentMonth = now.toLocaleString('default', { month: 'long' });
  const monthLogs = data.workoutLogs.filter(l => {
    const d = new Date(l.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const getName = (userId: string) => memberMap[userId]?.name ?? 'Unknown';
  const getEmoji = (userId: string) => memberMap[userId]?.emoji ?? '💪';

  const filterOptions = useMemo(() => [
    { id: 'all', label: '👥 All' },
    { id: 'me', label: `${profile?.emoji} Me` },
    ...members.map(m => ({ id: m.id, label: `${m.emoji} ${m.name}` })),
  ], [profile, members]);

  const timeline = useMemo((): TimelineEvent[] => {
    const events: TimelineEvent[] = [];
    data.workoutLogs.forEach(log => {
      events.push({ kind: 'workout', log });
      if (log.treatSelected) {
        const option = getTreatOption(log.treatSelected, allDynTreats);
        if (option) events.push({ kind: 'treat', log, option });
      }
    });
    data.resolutionLog.forEach(event => events.push({ kind: 'resolution', event }));
    return events;
  }, [data.workoutLogs, data.resolutionLog, allDynTreats]);

  const filteredTimeline = useMemo(() => {
    return timeline
      .filter(e => {
        if (userFilter !== 'all') {
          const targetId = userFilter === 'me' ? myId : userFilter;
          if (e.kind === 'workout' || e.kind === 'treat') {
            if (e.log.userId !== targetId) return false;
          } else if (e.kind === 'resolution') {
            if (e.event.debtorUserId !== targetId) return false;
          }
        }
        if (eventFilter === 'workouts') return e.kind === 'workout';
        if (eventFilter === 'treats') return e.kind === 'treat';
        if (eventFilter === 'resolutions') return e.kind === 'resolution';
        if (eventFilter === 'passed') return e.kind === 'workout' && e.log.status === 'forgiven';
        return true;
      })
      .sort((a, b) => {
        const dateA = a.kind === 'resolution' ? a.event.resolvedAt : a.log.date;
        const dateB = b.kind === 'resolution' ? b.event.resolvedAt : b.log.date;
        if (dateA === dateB) {
          const kindOrder = { workout: 0, treat: 1, resolution: 2 };
          return kindOrder[a.kind] - kindOrder[b.kind];
        }
        return dateB.localeCompare(dateA);
      });
  }, [timeline, userFilter, eventFilter, myId]);

  const logToEdit = editingLog ? data.workoutLogs.find(l => l.id === editingLog) : null;

  return (
    <div className="container space-y-6 pb-8">
      <h2 className="text-4xl md:text-5xl font-heading text-secondary text-center">📜 History</h2>

      <div className="brutal-card bg-accent/30 p-4 text-center">
        <p className="font-heading text-2xl text-secondary">{currentMonth} Summary</p>
        <div className="flex justify-center gap-6 mt-2 font-mono text-base font-bold flex-wrap">
          {allMemberIds.map(id => {
            const done = monthLogs.filter(l => l.userId === id && l.status === 'done').length;
            const total = monthLogs.filter(l => l.userId === id).length;
            return (
              <span key={id}>
                {getEmoji(id)} {getName(id)}: <strong>{done}/{total}</strong> ✅
              </span>
            );
          })}
        </div>
      </div>

      {/* User filter */}
      <div className="flex bg-muted rounded-full border-2 border-foreground p-1 max-w-lg mx-auto overflow-x-auto">
        {filterOptions.map(opt => (
          <button
            key={opt.id}
            onClick={() => setUserFilter(opt.id)}
            className={`flex-1 py-2.5 rounded-full font-heading text-lg transition-all whitespace-nowrap px-3 ${
              userFilter === opt.id ? 'bg-primary text-primary-foreground shadow-brutal-sm' : 'text-muted-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Event filter */}
      <div className="flex bg-muted rounded-full border-2 border-foreground p-1 max-w-xl mx-auto">
        {[
          { id: 'all', label: '📋 All' },
          { id: 'workouts', label: '🏋️ Workouts' },
          { id: 'treats', label: '🎁 Treats' },
          { id: 'resolutions', label: '✅ Resolved' },
          { id: 'passed', label: '🫶 Passed' },
        ].map(opt => (
          <button
            key={opt.id}
            onClick={() => setEventFilter(opt.id as typeof eventFilter)}
            className={`flex-1 py-2 rounded-full font-heading text-base transition-all ${
              eventFilter === opt.id ? 'bg-primary text-primary-foreground shadow-brutal-sm' : 'text-muted-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredTimeline.map((event, idx) => {
          if (event.kind === 'workout') {
            const log = event.log;
            const treat = log.treatSelected ? getTreatOption(log.treatSelected, allDynTreats) : null;
            const isTreatPending = log.status === 'missed' && log.treatSelected === null && !log.mutualMiss;
            const isForgiven = log.status === 'forgiven';
            const canEdit = myId === log.userId;

            return (
              <div key={`workout-${log.id}`} className="brutal-card p-4 hover-bounce">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getEmoji(log.userId)}</span>
                    <div>
                      <p className="font-heading text-xl text-secondary">{getName(log.userId)}</p>
                      <p className="font-mono text-sm font-bold text-muted-foreground">{formatDate(log.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span className={`brutal-badge ${
                      log.status === 'done' ? 'bg-success text-success-foreground'
                        : log.status === 'forgiven' ? 'bg-purple-100 text-purple-700 border-purple-300'
                        : 'bg-destructive text-destructive-foreground'
                    }`}>
                      {log.status === 'done' ? '✅ Done' : log.status === 'forgiven' ? '🫶 Passed' : '❌ Missed'}
                    </span>
                    {log.mutualMiss && <span className="brutal-badge bg-muted text-muted-foreground text-xs">🤝 Mutual Miss</span>}
                    {isTreatPending && <span className="brutal-badge bg-accent text-accent-foreground animate-pulse-glow text-xs">👀 TREAT PENDING</span>}
                    {canEdit && (
                      <button onClick={() => setEditingLog(log.id)} className="brutal-btn p-2 rounded-lg bg-muted text-base">✏️</button>
                    )}
                  </div>
                </div>
                {isForgiven && log.forgivenBy && (
                  <p className="mt-1 ml-11 font-mono text-sm font-bold text-purple-600">
                    🫶 {getName(log.forgivenBy)} let this one slide
                  </p>
                )}
                {log.notes && <p className="mt-2 text-base text-muted-foreground ml-11">💬 {log.notes}</p>}
                {treat && (
                  <p className="mt-1 ml-11 font-mono text-sm font-bold text-destructive">
                    🎁 Treat: {treat.emoji} {treat.name}
                  </p>
                )}
                {log.photoUrl && (
                  <img src={log.photoUrl} alt="Workout photo" className="mt-2 ml-11 rounded-lg border-2 border-foreground w-32 h-24 object-cover" loading="lazy" />
                )}
              </div>
            );
          }

          if (event.kind === 'treat') {
            const log = event.log;
            return (
              <div key={`treat-${log.id}-${idx}`} className="brutal-card p-4 border-destructive/50">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎁</span>
                  <div>
                    <p className="font-heading text-xl text-secondary">
                      Treat picked: {event.option.emoji} {event.option.name}
                    </p>
                    <p className="font-mono text-sm font-bold text-muted-foreground">
                      for {getName(log.userId)}'s miss on {formatDate(log.date)}
                    </p>
                  </div>
                </div>
              </div>
            );
          }

          const treatOption = getTreatOption(event.event.treatType, allDynTreats);
          return (
            <div key={`resolution-${event.event.id}`} className="brutal-card p-4 border-success/50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-heading text-xl text-secondary">
                    {getName(event.event.resolvedBy)} redeemed {treatOption?.emoji} {treatOption?.name}
                  </p>
                  <p className="font-mono text-sm font-bold text-muted-foreground">{formatDate(event.event.resolvedAt)}</p>
                </div>
              </div>
            </div>
          );
        })}

        {filteredTimeline.length === 0 && (
          <div className="brutal-card p-8 text-center text-muted-foreground">
            <p className="font-heading text-2xl">Nothing here yet.</p>
            <p className="font-mono text-sm font-bold mt-2">Log a workout to get started.</p>
          </div>
        )}
      </div>

      {logToEdit && (
        <LogWorkoutModal
          data={data}
          editLog={{
            id: logToEdit.id,
            userId: logToEdit.userId,
            date: logToEdit.date,
            status: logToEdit.status as 'done' | 'missed',
            notes: logToEdit.notes,
            photoUrl: logToEdit.photoUrl,
          }}
          onClose={() => setEditingLog(null)}
        />
      )}
    </div>
  );
}
