import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePact } from '@/context/PactContext';
import type { useAppData } from '@/hooks/useAppData';

type AppData = ReturnType<typeof useAppData>;

interface TreatSelectorProps {
  missedUserId: string;
  data: AppData;
  logId?: string | null;
  onClose: () => void;
}

export function TreatSelector({ missedUserId, data, logId, onClose }: TreatSelectorProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<'selecting' | 'confirming-forgive'>('selecting');
  const [forgiving, setForgiving] = useState(false);
  const { user, profile } = useAuth();
  const { members } = usePact();

  const getMember = (id: string) => {
    if (id === user?.id) return { name: profile?.name ?? '', emoji: profile?.emoji ?? '💪' };
    const m = members.find(m => m.id === id);
    return { name: m?.name ?? 'Unknown', emoji: m?.emoji ?? '💪' };
  };

  const missed = getMember(missedUserId);
  const picker = getMember(user?.id ?? '');

  const canPick = user?.id !== missedUserId;
  const options = data.getMyTreatOptions();

  const handleConfirm = () => {
    if (!selected) return;
    data.incrementTreat(missedUserId, selected);
    if (logId) data.updateWorkoutLog(logId, { treatSelected: selected });
    onClose();
  };

  const handleForgive = async () => {
    setForgiving(true);
    try {
      if (logId) await data.updateWorkoutLog(logId, { status: 'forgiven', forgivenBy: user?.id ?? null });
      onClose();
    } catch {
      setForgiving(false);
    }
  };

  if (!canPick) {
    return (
      <div className="fixed inset-0 bg-foreground/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
        <div className="brutal-card bg-background w-full md:max-w-lg md:rounded-xl rounded-t-2xl rounded-b-none md:rounded-b-xl p-6 animate-bounce-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-heading text-secondary">⏸️ Not Your Turn</h2>
            <button onClick={onClose} className="brutal-btn p-2 rounded-lg bg-muted"><X size={18} /></button>
          </div>
          <p className="font-mono text-base font-bold text-muted-foreground mb-6">
            You missed your workout, <strong className="text-foreground">{missed.emoji} {missed.name}</strong>.
            <br /><br />
            Someone from your pact gets to pick a reward.
          </p>
          <button onClick={onClose} className="brutal-btn w-full py-4 rounded-xl text-xl font-heading bg-muted text-muted-foreground hover-bounce">
            Close
          </button>
        </div>
      </div>
    );
  }

  if (step === 'confirming-forgive') {
    return (
      <div className="fixed inset-0 bg-foreground/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
        <div className="brutal-card bg-background w-full md:max-w-lg md:rounded-xl rounded-t-2xl rounded-b-none md:rounded-b-xl p-6 animate-bounce-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-heading text-secondary">🤝 Let It Slide?</h2>
            <button onClick={onClose} className="brutal-btn p-2 rounded-lg bg-muted"><X size={18} /></button>
          </div>
          <p className="font-mono text-base font-bold text-muted-foreground mb-8">
            You're letting this one slide. That's solid. 🤝
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleForgive}
              disabled={forgiving}
              className={`brutal-btn w-full py-4 rounded-xl text-xl font-heading ${forgiving ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover-bounce'}`}
            >
              {forgiving ? '⏳ Saving...' : 'Yes, let it slide'}
            </button>
            <button
              onClick={() => setStep('selecting')}
              className="brutal-btn w-full py-3 rounded-xl text-lg font-heading bg-muted text-muted-foreground hover-bounce"
            >
              Actually, pick a treat
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-foreground/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="brutal-card bg-background w-full md:max-w-2xl md:rounded-xl rounded-t-2xl rounded-b-none md:rounded-b-xl p-6 max-h-[90vh] overflow-y-auto animate-bounce-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-heading text-destructive">🎁 Treat Time!</h2>
          <button onClick={onClose} className="brutal-btn p-2 rounded-lg bg-muted"><X size={18} /></button>
        </div>

        <p className="font-mono text-base font-bold mb-6 text-muted-foreground">
          <strong className="text-foreground">{missed.emoji} {missed.name}</strong> missed their workout.
          <br />
          <strong className="text-foreground">{picker.emoji} {picker.name}</strong>, pick your reward 🎁:
        </p>

        {options.length === 0 ? (
          <div className="brutal-card bg-accent/30 p-6 text-center mb-6">
            <p className="text-4xl mb-3">😕</p>
            <p className="font-heading text-xl text-secondary mb-2">No treats defined yet</p>
            <p className="font-mono text-sm font-bold text-muted-foreground">
              You haven't set up any treats yet. Go to My Treats to add the rewards you want to earn!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {options.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSelected(opt.key)}
                className={`brutal-card p-4 text-left transition-all hover-bounce ${
                  selected === opt.key ? 'border-primary bg-primary/10 shadow-brutal-lg' : 'hover:border-primary/50'
                }`}
              >
                <p className="text-2xl mb-1">{opt.emoji}</p>
                <p className="font-heading text-xl text-secondary">{opt.name}</p>
                <p className="font-mono text-sm font-bold text-muted-foreground">{opt.description}</p>
              </button>
            ))}
          </div>
        )}

        {options.length > 0 && (
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className={`brutal-btn w-full py-4 rounded-xl text-xl font-heading mb-3 ${
              selected ? 'bg-destructive text-destructive-foreground hover-bounce' : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            🎁 Pick This Treat
          </button>
        )}

        <button
          onClick={() => setStep('confirming-forgive')}
          className="brutal-btn w-full py-4 rounded-xl text-xl font-heading bg-muted text-muted-foreground border-2 border-foreground hover-bounce"
        >
          Let it slide 🤝
        </button>
      </div>
    </div>
  );
}
