import { useState } from 'react';
import type { TreatOption } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { usePact } from '@/context/PactContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import type { AppData } from '@/pages/Dashboard';

interface TreatTrackerProps {
  data: AppData;
}

export default function TreatTracker({ data }: TreatTrackerProps) {
  const { user, profile } = useAuth();
  const { members } = usePact();
  const [selected, setSelected] = useState<{ treat: TreatOption; beneficiaryId: string; debtorId: string } | null>(null);
  const [confirmRedeem, setConfirmRedeem] = useState<{ debtorId: string; treatKey: string; resolverId: string; treatName: string; treatEmoji: string } | null>(null);

  const myId = user?.id ?? '';

  const allUsers = [
    { id: myId, name: profile?.name ?? '', emoji: profile?.emoji ?? '💪' },
    ...members.map(m => ({ id: m.id, name: m.name, emoji: m.emoji })),
  ];

  const getUnresolvedCount = (debtorId: string, treatKey: string) => {
    const counts = data.treatCounts[debtorId]?.[treatKey];
    return counts ? counts.total - counts.resolved : 0;
  };

  const getTotalEarned = (beneficiaryId: string): number => {
    const treats = data.getTreatsForUser(beneficiaryId);
    let total = 0;
    for (const debtor of allUsers) {
      if (debtor.id === beneficiaryId) continue;
      for (const t of treats) {
        total += getUnresolvedCount(debtor.id, t.key);
      }
    }
    return total;
  };

  return (
    <div className="container space-y-6 pb-8">
      <h2 className="text-4xl md:text-5xl font-heading text-secondary text-center">🎁 Treat Tracker</h2>

      <div className="brutal-card bg-secondary text-secondary-foreground p-5">
        <div className="flex items-center justify-center gap-4 md:gap-6 text-center font-heading text-xl md:text-2xl flex-wrap">
          {allUsers.map((u, i) => (
            <span key={u.id}>
              {i > 0 && <span className="text-accent text-3xl mx-2">⚖️</span>}
              {u.emoji} {u.name}: <span className="text-accent">{getTotalEarned(u.id)}</span>
            </span>
          ))}
        </div>
      </div>

      {selected && (() => {
        const { treat: p, debtorId } = selected;
        const unresolvedCount = getUnresolvedCount(debtorId, p.key);
        const isActive = unresolvedCount > 0;

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
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {confirmRedeem && (
        <Dialog open onOpenChange={() => setConfirmRedeem(null)}>
          <DialogContent className="brutal-card max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-2xl font-heading text-secondary">
                <span className="text-4xl">{confirmRedeem.treatEmoji}</span>
                Redeem Treat?
              </DialogTitle>
              <DialogDescription className="font-body text-base pt-1">
                Confirm you've received <span className="font-heading text-secondary">{confirmRedeem.treatName}</span>? This will be logged and cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmRedeem(null)}
                className="brutal-btn flex-1 py-2.5 rounded-xl font-heading bg-muted text-muted-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  data.resolveTreat(confirmRedeem.debtorId, confirmRedeem.treatKey, confirmRedeem.resolverId);
                  setConfirmRedeem(null);
                  setSelected(null);
                }}
                className="brutal-btn flex-1 py-2.5 rounded-xl font-heading bg-success text-success-foreground hover-bounce"
              >
                ✓ Confirm
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {allUsers.map(beneficiary => {
        const treats = data.getTreatsForUser(beneficiary.id);
        const isMe = beneficiary.id === myId;
        const sectionLabel = isMe
          ? `${beneficiary.emoji} Treats You've Earned`
          : `${beneficiary.emoji} ${beneficiary.name}'s Earned Treats`;

        const debtors = allUsers.filter(u => u.id !== beneficiary.id);

        return (
          <div key={beneficiary.id}>
            <h3 className={`mb-3 font-heading text-xl ${isMe ? 'text-secondary' : 'text-muted-foreground'}`}>
              {sectionLabel}
            </h3>
            {treats.length === 0 ? (
              <div className="brutal-card p-6 text-center opacity-60">
                <p className="font-mono text-sm font-bold text-muted-foreground">
                  {isMe ? "You haven't defined any treats yet. Go to My Treats to add some." : `${beneficiary.name} hasn't defined any treats yet.`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {treats.map(p => {
                  let totalUnresolved = 0;
                  for (const d of debtors) {
                    totalUnresolved += getUnresolvedCount(d.id, p.key);
                  }
                  const isActive = totalUnresolved > 0;
                  const redeemDebtor = isMe ? debtors.find(d => getUnresolvedCount(d.id, p.key) > 0) : undefined;
                  const canRedeem = isMe && redeemDebtor !== undefined;

                  return (
                    <div
                      key={p.key}
                      onClick={() => {
                        const debtorId = debtors.find(d => getUnresolvedCount(d.id, p.key) > 0)?.id ?? debtors[0]?.id ?? '';
                        setSelected({ treat: p, beneficiaryId: beneficiary.id, debtorId });
                      }}
                      className={`brutal-card p-4 transition-all cursor-pointer hover:scale-[1.02] ${
                        isActive ? 'animate-pulse-glow' : 'opacity-50 grayscale'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl">{p.emoji}</span>
                        <span className={`text-3xl font-heading font-extrabold ${isActive ? 'text-destructive animate-bounce-in' : 'text-muted-foreground'}`}>
                          ×{totalUnresolved}
                        </span>
                      </div>
                      <p className="font-heading text-xl text-secondary">{p.name}</p>
                      <p className="font-mono text-sm font-bold text-muted-foreground mb-3">{p.description}</p>
                      {canRedeem && (
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmRedeem({ debtorId: redeemDebtor!.id, treatKey: p.key, resolverId: myId, treatName: p.name, treatEmoji: p.emoji }); }}
                          className="brutal-btn w-full py-2.5 rounded-lg text-base font-heading bg-success text-success-foreground hover-bounce"
                        >
                          🎁 Redeem
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
