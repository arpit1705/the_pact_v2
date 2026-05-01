import { useState } from 'react';
import { UserCard } from '@/components/UserCard';
import { LogWorkoutModal } from '@/components/LogWorkoutModal';
import { TreatSelector } from '@/components/TreatSelector';
import { MotivationalBanner } from '@/components/MotivationalBanner';
import { useAuth } from '@/context/AuthContext';
import { useCouple } from '@/context/CoupleContext';
import { useAppData } from '@/hooks/useAppData';

export type AppData = ReturnType<typeof useAppData>;

interface DashboardProps {
  data: AppData;
}

export default function Dashboard({ data }: DashboardProps) {
  const { user, profile } = useAuth();
  const { partner } = useCouple();
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [treatModalUserId, setTreatModalUserId] = useState<string | null>(null);

  const myId = user?.id ?? '';
  const partnerId = partner?.id ?? '';

  const partnerPendingLogs = data.getPendingMissedLogs(partnerId);
  const hasPendingTreat = partnerPendingLogs.length > 0;

  const allTreatsResolved = data.getTotalTreats(myId) === 0 && data.getTotalTreats(partnerId) === 0;
  const noPendingMissed =
    data.getPendingMissedLogs(myId).length === 0 && data.getPendingMissedLogs(partnerId).length === 0;
  const showCelebration = allTreatsResolved && noPendingMissed;

  // Always show current user first
  const users = [
    { id: myId, name: profile?.name ?? '', emoji: profile?.emoji ?? '💪', isMe: true },
    { id: partnerId, name: partner?.name ?? '', emoji: partner?.emoji ?? '💪', isMe: false },
  ];

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
        {users.map(u => (
          <UserCard
            key={u.id}
            name={u.name}
            emoji={u.emoji}
            streak={data.getStreakForUser(u.id)}
            todayStatus={data.getTodayStatus(u.id)}
            monthlyCount={data.getMonthlyCount(u.id)}
            totalTreats={data.getTotalTreats(u.isMe ? partnerId : myId)}
            isMe={u.isMe}
            onPickTreat={
              !u.isMe && hasPendingTreat ? () => setTreatModalUserId(partnerId) : undefined
            }
          />
        ))}
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
          logId={partnerPendingLogs[0]?.id ?? null}
          onClose={() => setTreatModalUserId(null)}
        />
      )}
    </div>
  );
}
