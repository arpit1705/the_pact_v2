import { useState, useMemo } from 'react';
import { UserCard } from '@/components/UserCard';
import { LogWorkoutModal } from '@/components/LogWorkoutModal';
import { TreatSelector } from '@/components/TreatSelector';
import { MotivationalBanner } from '@/components/MotivationalBanner';
import { useAuth } from '@/context/AuthContext';
import { usePact } from '@/context/PactContext';
import { useAppData } from '@/hooks/useAppData';

export type AppData = ReturnType<typeof useAppData>;

interface DashboardProps {
  data: AppData;
}

export default function Dashboard({ data }: DashboardProps) {
  const { user, profile } = useAuth();
  const { members } = usePact();
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [treatModalUserId, setTreatModalUserId] = useState<string | null>(null);

  const myId = user?.id ?? '';

  const users = useMemo(() => [
    { id: myId, name: profile?.name ?? '', emoji: profile?.emoji ?? '💪', isMe: true },
    ...members.map(m => ({ id: m.id, name: m.name, emoji: m.emoji, isMe: false })),
  ], [myId, profile, members]);

  const pendingByMember = useMemo(() => {
    const map: Record<string, ReturnType<typeof data.getPendingMissedLogs>> = {};
    for (const m of members) {
      map[m.id] = data.getPendingMissedLogs(m.id);
    }
    return map;
  }, [members, data]);

  const allTreatsResolved = users.every(u => data.getTotalTreats(u.id) === 0);
  const noPendingMissed = users.every(u => data.getPendingMissedLogs(u.id).length === 0);
  const showCelebration = allTreatsResolved && noPendingMissed;

  return (
    <div className="container space-y-6 pb-8">
      <div className="text-center mb-2">
        <h2 className="text-4xl md:text-5xl font-heading text-secondary">The Scoreboard ⚡</h2>
      </div>

      {showCelebration && (
        <div className="brutal-card bg-success text-success-foreground p-4 text-center animate-bounce-in">
          <p className="font-heading text-2xl">🎉 You're both killing it. The Pact is satisfied.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {users.map(u => {
          const pendingCount = u.isMe ? 0 : (pendingByMember[u.id]?.length ?? 0);
          return (
            <UserCard
              key={u.id}
              name={u.name}
              emoji={u.emoji}
              streak={data.getStreakForUser(u.id)}
              todayStatus={data.getTodayStatus(u.id)}
              monthlyCount={data.getMonthlyCount(u.id)}
              totalTreats={data.getTotalTreats(u.id)}
              isMe={u.isMe}
              pendingCount={pendingCount}
              onPickTreat={pendingCount > 0 ? () => setTreatModalUserId(u.id) : undefined}
            />
          );
        })}
      </div>

      <MotivationalBanner />

      <div className="text-center space-y-3">
        <p className="font-mono text-base font-bold text-muted-foreground uppercase tracking-wider">⚡ Quick Log ⚡</p>
        <div className="flex justify-center">
          <button
            onClick={() => setLogModalOpen(true)}
            className="brutal-btn bg-secondary text-secondary-foreground px-8 py-4 rounded-xl text-xl hover-bounce"
          >
            {profile?.emoji} Log My Workout
          </button>
        </div>
      </div>

      {logModalOpen && (
        <LogWorkoutModal data={data} onClose={() => setLogModalOpen(false)} />
      )}

      {treatModalUserId && (
        <TreatSelector
          missedUserId={treatModalUserId}
          data={data}
          pendingLogIds={(pendingByMember[treatModalUserId] ?? []).map(l => l.id)}
          onClose={() => setTreatModalUserId(null)}
        />
      )}
    </div>
  );
}
