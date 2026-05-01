interface UserCardProps {
  name: string;
  emoji: string;
  streak: number;
  todayStatus: 'done' | 'missed' | 'forgiven' | 'not-logged';
  monthlyCount: { done: number; total: number };
  totalTreats: number;
  isMe: boolean;
  onPickTreat?: () => void;
}

const STATUS_CONFIG = {
  done: { label: '✅ DONE', className: 'bg-success text-success-foreground' },
  missed: { label: '❌ MISSED', className: 'bg-destructive text-destructive-foreground' },
  forgiven: { label: '🫶 LET SLIDE', className: 'bg-purple-100 text-purple-700 border-purple-300' },
  'not-logged': { label: '⏳ NOT LOGGED YET', className: 'bg-accent text-accent-foreground' },
};

export function UserCard({
  name, emoji, streak, todayStatus, monthlyCount, totalTreats, isMe, onPickTreat,
}: UserCardProps) {
  const status = STATUS_CONFIG[todayStatus];

  return (
    <div className={`brutal-card p-6 hover-bounce ${isMe ? 'animate-pulse-glow-primary' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{emoji}</span>
          <div className="flex items-center gap-2">
            <h3 className="text-secondary">{name}</h3>
            {isMe && <span className="brutal-badge bg-primary text-primary-foreground text-xs">YOU</span>}
          </div>
        </div>
        {totalTreats > 0 && (
          <span className="brutal-badge bg-amber-400 text-amber-900 animate-pulse-glow text-base">
            {totalTreats} treats 🎁
          </span>
        )}
      </div>

      <div className={`brutal-badge text-lg px-4 py-2.5 mb-4 w-full justify-center ${status.className}`}>
        {status.label}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-accent/50 rounded-lg border-2 border-foreground p-3 text-center">
          <p className="text-2xl font-heading font-extrabold">🔥 {streak}</p>
          <p className="font-mono text-sm font-bold text-muted-foreground">day streak</p>
        </div>
        <div className="bg-accent/50 rounded-lg border-2 border-foreground p-3 text-center">
          <p className="text-2xl font-heading font-extrabold">{monthlyCount.done}/{monthlyCount.total}</p>
          <p className="font-mono text-sm font-bold text-muted-foreground">this month</p>
        </div>
      </div>

      {onPickTreat && (
        <button
          onClick={onPickTreat}
          className="brutal-btn mt-3 w-full py-2.5 rounded-lg bg-amber-400 text-amber-900 text-base font-heading hover-bounce"
        >
          🎁 {name} missed! Pick their treat →
        </button>
      )}
    </div>
  );
}
