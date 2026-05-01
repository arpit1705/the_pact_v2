import { useState } from 'react';
import { getAllTreatsForUser } from '@/types';
import type { TreatOption } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useCouple } from '@/context/CoupleContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { AppData } from '@/pages/Dashboard';

interface TreatTrackerProps {
  data: AppData;
}

export default function TreatTracker({ data }: TreatTrackerProps) {
  const { user, profile } = useAuth();
  const { partner, partner1Id } = useCouple();
  const [selected, setSelected] = useState<{ treat: TreatOption; userId: string } | null>(null);

  const myId = user?.id ?? '';
  const partnerId = partner?.id ?? '';

  const myTotal = data.getTotalTreats(myId);
  const partnerTotal = data.getTotalTreats(partnerId);

  const users = [
    { id: myId, name: profile?.name ?? '', emoji: profile?.emoji ?? '💪' },
    { id: partnerId, name: partner?.name ?? '', emoji: partner?.emoji ?? '💪' },
  ];

  return (
    <div className="container space-y-6 pb-8">
      <h2 className="text-4xl md:text-5xl font-heading text-secondary text-center">🎁 Treat Tracker</h2>

      <div className="brutal-card bg-secondary text-secondary-foreground p-5">
        <div className="flex items-center justify-center gap-4 md:gap-8 text-center font-heading text-2xl md:text-3xl">
          <span>{partner?.emoji} {partner?.name} has earned <span className="text-accent">{partnerTotal}</span></span>
          <span className="text-accent text-4xl">⚖️</span>
          <span>{profile?.emoji} {profile?.name} has earned <span className="text-accent">{myTotal}</span></span>
        </div>
      </div>

      {selected && (() => {
        const { treat: p, userId } = selected;
        const counts = data.treatCounts[userId]?.[p.key];
        const unresolvedCount = counts ? counts.total - counts.resolved : 0;
        const isActive = unresolvedCount > 0;
        const canResolve = myId !== userId;

        return (
          <Dialog open onOpenChange={() => setSelected(null)}>
            <DialogContent className="brutal-card max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-2xl font-heading text-secondary">
                  <span className="text-4xl">{p.emoji}</span>
                  {p.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="font-mono text-sm font-bold text-muted-foreground">{p.description}</p>
                <p className="font-body text-base leading-relaxed">{p.details}</p>
                {isActive && (
                  <div className="brutal-card bg-destructive/10 px-4 py-2 rounded-lg inline-block">
                    <span className="font-heading text-destructive font-bold">×{unresolvedCount} outstanding</span>
                  </div>
                )}
                {isActive && canResolve && (
                  <button
                    onClick={() => { data.resolveTreat(userId, p.key, myId); setSelected(null); }}
                    className="brutal-btn w-full py-3 rounded-xl text-lg font-heading bg-success text-success-foreground hover-bounce"
                  >
                    ✓ Redeem
                  </button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {users.map(u => {
        const treats = getAllTreatsForUser(u.id, partner1Id ?? '');
        const isMe = u.id === myId;
        const sectionLabel = isMe
          ? `${u.emoji} Your Treats owed (read-only)`
          : `${u.emoji} ${u.name}'s Treats — redeem these`;

        return (
          <div key={u.id}>
            <h3 className={`mb-3 ${isMe ? 'text-muted-foreground' : 'text-secondary'}`}>
              {sectionLabel}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {treats.map(p => {
                const counts = data.treatCounts[u.id]?.[p.key];
                const unresolvedCount = counts ? counts.total - counts.resolved : 0;
                const isActive = unresolvedCount > 0;
                const canResolve = !isMe && isActive;

                return (
                  <div
                    key={p.key}
                    onClick={() => setSelected({ treat: p, userId: u.id })}
                    className={`brutal-card p-4 transition-all cursor-pointer hover:scale-[1.02] ${
                      isActive ? 'animate-pulse-glow' : 'opacity-50 grayscale'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{p.emoji}</span>
                      <span className={`text-3xl font-heading font-extrabold ${isActive ? 'text-destructive animate-bounce-in' : 'text-muted-foreground'}`}>
                        ×{unresolvedCount}
                      </span>
                    </div>
                    <p className="font-heading text-xl text-secondary">{p.name}</p>
                    <p className="font-mono text-sm font-bold text-muted-foreground mb-3">{p.description}</p>
                    <button
                      onClick={e => { e.stopPropagation(); if (canResolve) data.resolveTreat(u.id, p.key, myId); }}
                      disabled={!canResolve}
                      className={`brutal-btn w-full py-2.5 rounded-lg text-base font-heading ${
                        canResolve
                          ? 'bg-success text-success-foreground hover-bounce'
                          : 'bg-muted text-muted-foreground cursor-not-allowed'
                      }`}
                    >
                      ✓ Redeem
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
