import { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePact } from '@/context/PactContext';
import type { AppData } from '@/pages/Dashboard';

interface StatsProps {
  data: AppData;
}

type Preset = 'week' | 'month' | 'last-month' | 'all';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getPresetRange(preset: Preset): { from: string; to: string } {
  const today = startOfDay(new Date());
  const to = toDateStr(today);

  if (preset === 'week') {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: toDateStr(from), to };
  }
  if (preset === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toDateStr(from), to };
  }
  if (preset === 'last-month') {
    const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const toDate = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: toDateStr(from), to: toDateStr(toDate) };
  }
  return { from: '2000-01-01', to };
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="brutal-card p-2.5 sm:p-4 text-center">
      <p className="font-mono text-[10px] sm:text-xs font-bold uppercase tracking-wide text-muted-foreground mb-0.5 sm:mb-1 leading-tight">{label}</p>
      <p className="font-heading text-2xl sm:text-4xl text-secondary">{value}</p>
    </div>
  );
}

export default function Stats({ data }: StatsProps) {
  const { user, profile } = useAuth();
  const { members } = usePact();

  const myId = user?.id ?? '';

  const memberMap = useMemo(() => {
    const map: Record<string, { name: string; emoji: string }> = {};
    if (profile) map[myId] = { name: profile.name, emoji: profile.emoji };
    members.forEach(m => { map[m.id] = { name: m.name, emoji: m.emoji }; });
    return map;
  }, [myId, profile, members]);

  const allMemberIds = useMemo(() => [myId, ...members.map(m => m.id)], [myId, members]);

  const [preset, setPreset] = useState<Preset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const range = useMemo(() => {
    if (useCustom && customFrom && customTo) return { from: customFrom, to: customTo };
    return getPresetRange(preset);
  }, [preset, customFrom, customTo, useCustom]);

  const logsInRange = useMemo(
    () => data.workoutLogs.filter(l => l.date >= range.from && l.date <= range.to),
    [data.workoutLogs, range],
  );

  const resolutionsInRange = useMemo(
    () => data.resolutionLog.filter(e => e.resolvedAt >= range.from && e.resolvedAt <= range.to),
    [data.resolutionLog, range],
  );

  const allTreats = useMemo(
    () => allMemberIds.flatMap(id => data.getTreatsForUser(id)),
    [data, allMemberIds],
  );

  const memberStats = useMemo(() => {
    return allMemberIds.map(id => {
      const logs = logsInRange.filter(l => l.userId === id);
      const done = logs.filter(l => l.status === 'done').length;
      const missed = logs.filter(l => l.status === 'missed' && !l.mutualMiss).length;
      const forgiven = logs.filter(l => l.status === 'forgiven').length;
      const mutualMisses = logs.filter(l => l.mutualMiss).length;
      const total = logs.length;
      const rate = total > 0 ? Math.round((done / total) * 100) : 0;

      // treats earned = misses from OTHER members' perspective (they owe treats to pact members)
      // treats owed by this user = their missed logs that had a treat selected
      const treatsOwed = logs.filter(l => l.status === 'missed' && l.treatSelected !== null && !l.mutualMiss).length;

      // forgiven misses given by this user to others (forgivenBy === id)
      const forgaveOthers = logsInRange.filter(l => l.forgivenBy === id).length;

      // resolutions in range where this user was the creditor (resolvedBy === id)
      const treatsRedeemed = resolutionsInRange.filter(e => e.resolvedBy === id).length;

      return { id, done, missed, forgiven, mutualMisses, total, rate, treatsOwed, forgaveOthers, treatsRedeemed };
    });
  }, [allMemberIds, logsInRange, resolutionsInRange]);

  // Treat breakdown: how many of each treat were earned (selected) in range
  const treatBreakdown = useMemo(() => {
    const counts: Record<string, { treat: typeof allTreats[0]; earned: number; redeemed: number }> = {};
    logsInRange.forEach(l => {
      if (l.treatSelected && l.status === 'missed' && !l.mutualMiss) {
        if (!counts[l.treatSelected]) {
          const treat = allTreats.find(t => t.key === l.treatSelected);
          if (!treat) return;
          counts[l.treatSelected] = { treat, earned: 0, redeemed: 0 };
        }
        counts[l.treatSelected].earned++;
      }
    });
    resolutionsInRange.forEach(e => {
      if (counts[e.treatType]) {
        counts[e.treatType].redeemed++;
      } else {
        const treat = allTreats.find(t => t.key === e.treatType);
        if (!treat) return;
        counts[e.treatType] = { treat, earned: 0, redeemed: 1 };
      }
    });
    return Object.values(counts).sort((a, b) => b.earned - a.earned);
  }, [logsInRange, resolutionsInRange, allTreats]);

  const totalMutualMisses = useMemo(() => {
    // Count unique dates where mutual miss occurred (avoid double-counting per member)
    const mutualDates = new Set(logsInRange.filter(l => l.mutualMiss).map(l => l.date));
    return mutualDates.size;
  }, [logsInRange]);

  const rangeLabel = useCustom && customFrom && customTo
    ? `${formatDate(customFrom)} – ${formatDate(customTo)}`
    : preset === 'week' ? 'Last 7 Days'
    : preset === 'month' ? 'This Month'
    : preset === 'last-month' ? 'Last Month'
    : 'All Time';

  const getName = (id: string) => memberMap[id]?.name ?? 'Unknown';
  const getEmoji = (id: string) => memberMap[id]?.emoji ?? '💪';

  return (
    <div className="container space-y-4 sm:space-y-6 pb-8">
      <h2 className="text-3xl sm:text-4xl md:text-5xl font-heading text-secondary text-center">📊 Stats</h2>

      {/* Date range controls */}
      <div className="brutal-card p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            { id: 'week', label: '7 Days' },
            { id: 'month', label: 'This Month' },
            { id: 'last-month', label: 'Last Month' },
            { id: 'all', label: 'All Time' },
          ] as { id: Preset; label: string }[]).map(p => (
            <button
              key={p.id}
              onClick={() => { setPreset(p.id); setUseCustom(false); }}
              className={`brutal-btn py-2.5 rounded-lg font-heading text-base sm:text-lg whitespace-nowrap px-2 ${
                !useCustom && preset === p.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-accent-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-bold text-muted-foreground w-full sm:w-auto">Custom:</span>
          <input
            type="date"
            value={customFrom}
            onChange={e => { setCustomFrom(e.target.value); setUseCustom(true); }}
            className="flex-1 min-w-0 px-3 py-2 font-mono text-sm bg-background border-2 border-foreground rounded-lg"
          />
          <span className="font-mono text-sm font-bold shrink-0">→</span>
          <input
            type="date"
            value={customTo}
            onChange={e => { setCustomTo(e.target.value); setUseCustom(true); }}
            className="flex-1 min-w-0 px-3 py-2 font-mono text-sm bg-background border-2 border-foreground rounded-lg"
          />
        </div>

        <p className="font-mono text-xs sm:text-sm font-bold text-center text-muted-foreground">
          Showing: <span className="text-foreground">{rangeLabel}</span>
          {' · '}
          <span className="text-foreground">{logsInRange.length}</span> logs
        </p>
      </div>

      {/* Per-member stats */}
      <div className="space-y-4">
        {memberStats.map(s => (
          <div key={s.id} className="brutal-card p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl sm:text-3xl shrink-0">{getEmoji(s.id)}</span>
              <div className="min-w-0">
                <p className="font-heading text-xl sm:text-2xl text-secondary truncate">{getName(s.id)}</p>
                {s.id === myId && <span className="brutal-badge bg-secondary text-secondary-foreground text-xs">YOU</span>}
              </div>
              <div className="ml-auto text-right shrink-0">
                <p className="font-heading text-3xl sm:text-4xl text-primary">{s.rate}%</p>
                <p className="font-mono text-[10px] sm:text-xs font-bold text-muted-foreground">completion</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <StatBox label="✅ Done" value={s.done} />
              <StatBox label="❌ Missed" value={s.missed} />
              <StatBox label="🫶 Forgiven" value={s.forgiven} />
              <StatBox label="🤝 Mutual" value={s.mutualMisses} />
              <StatBox label="🎁 Owed" value={s.treatsOwed} />
              <StatBox label="✅ Redeemed" value={s.treatsRedeemed} />
            </div>

            {s.forgaveOthers > 0 && (
              <p className="font-mono text-sm font-bold text-purple-600">
                🫶 Let {s.forgaveOthers} miss{s.forgaveOthers !== 1 ? 'es' : ''} slide for others
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Treat breakdown */}
      {treatBreakdown.length > 0 && (
        <div className="brutal-card p-4 sm:p-5 space-y-3">
          <p className="font-heading text-xl sm:text-2xl text-secondary">🎁 Treat Breakdown</p>
          <div className="space-y-2">
            {treatBreakdown.map(({ treat, earned, redeemed }) => (
              <div key={treat.key} className="brutal-card p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl shrink-0">{treat.emoji}</span>
                  <span className="font-heading text-base sm:text-lg truncate">{treat.name}</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 font-mono text-xs sm:text-sm font-bold flex-wrap pl-7 sm:pl-0">
                  <span className="text-destructive">×{earned} earned</span>
                  <span className="text-success">×{redeemed} redeemed</span>
                  {earned - redeemed > 0 && (
                    <span className="brutal-badge bg-accent text-accent-foreground animate-pulse-glow text-xs">
                      {earned - redeemed} pending
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mutual misses callout */}
      {totalMutualMisses > 0 && (
        <div className="brutal-card p-4 bg-muted/50 text-center">
          <p className="font-heading text-base sm:text-xl text-secondary">
            🤝 {totalMutualMisses} day{totalMutualMisses !== 1 ? 's' : ''} where everyone missed — no treats owed
          </p>
        </div>
      )}

      {/* Head-to-head (2-person pacts only) */}
      {allMemberIds.length === 2 && memberStats.length === 2 && (() => {
        const [a, b] = memberStats;
        const aWins = a.done > b.done;
        const tied = a.done === b.done;
        return (
          <div className="brutal-card p-4 sm:p-5 space-y-3">
            <p className="font-heading text-xl sm:text-2xl text-secondary text-center">⚔️ Head-to-Head</p>
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <div className="flex-1 min-w-0 text-center">
                <p className="text-2xl sm:text-3xl">{getEmoji(a.id)}</p>
                <p className="font-heading text-base sm:text-xl truncate">{getName(a.id)}</p>
                <p className="font-heading text-4xl sm:text-5xl text-primary mt-1">{a.done}</p>
                <p className="font-mono text-[10px] sm:text-xs font-bold text-muted-foreground">workouts done</p>
              </div>
              <div className="text-center shrink-0">
                <p className="font-heading text-xl sm:text-2xl text-muted-foreground">VS</p>
                {!tied && (
                  <p className="brutal-badge bg-primary text-primary-foreground text-xs mt-2">
                    {aWins ? `${getEmoji(a.id)} leads` : `${getEmoji(b.id)} leads`}
                  </p>
                )}
                {tied && <p className="brutal-badge bg-muted text-muted-foreground text-xs mt-2">tied</p>}
              </div>
              <div className="flex-1 min-w-0 text-center">
                <p className="text-2xl sm:text-3xl">{getEmoji(b.id)}</p>
                <p className="font-heading text-base sm:text-xl truncate">{getName(b.id)}</p>
                <p className="font-heading text-4xl sm:text-5xl text-primary mt-1">{b.done}</p>
                <p className="font-mono text-[10px] sm:text-xs font-bold text-muted-foreground">workouts done</p>
              </div>
            </div>
            <div className="flex justify-between font-mono text-xs sm:text-sm font-bold text-muted-foreground border-t-2 border-foreground pt-3">
              <span>{a.rate}% rate</span>
              <span>{b.rate}% rate</span>
            </div>
            <div className="flex justify-between font-mono text-xs sm:text-sm font-bold text-muted-foreground">
              <span>{a.treatsOwed} treats owed</span>
              <span>{b.treatsOwed} treats owed</span>
            </div>
          </div>
        );
      })()}

      {logsInRange.length === 0 && (
        <div className="brutal-card p-8 text-center text-muted-foreground">
          <p className="font-heading text-2xl">No data for this period.</p>
          <p className="font-mono text-sm font-bold mt-2">Try a wider date range.</p>
        </div>
      )}
    </div>
  );
}
