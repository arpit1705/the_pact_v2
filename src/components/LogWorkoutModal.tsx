import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { TreatSelector } from '@/components/TreatSelector';
import { ConfettiCelebration } from '@/components/ConfettiCelebration';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePact } from '@/context/PactContext';
import type { useAppData } from '@/hooks/useAppData';

type AppData = ReturnType<typeof useAppData>;

// Oldest day in the last 7 with no log for this user, so a returning user lands on
// their earliest gap rather than today. Falls back to today if all days are logged.
function oldestUnloggedDate(logs: AppData['workoutLogs'], userId?: string): string {
  const today = new Date().toISOString().split('T')[0];
  if (!userId) return today;

  const loggedDates = new Set(logs.filter(l => l.userId === userId).map(l => l.date));
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    if (!loggedDates.has(dateStr)) return dateStr;
  }
  return today;
}

interface LogWorkoutModalProps {
  data: AppData;
  editLog?: { id: string; userId: string; date: string; status: 'done' | 'missed'; notes?: string; photoUrl?: string };
  onClose: () => void;
}

export function LogWorkoutModal({ data, editLog, onClose }: LogWorkoutModalProps) {
  const { user } = useAuth();
  const { pactId } = usePact();

  const [date, setDate] = useState(
    editLog?.date || oldestUnloggedDate(data.workoutLogs, user?.id),
  );
  const [status, setStatus] = useState<'done' | 'missed' | null>(editLog?.status || null);
  const [notes, setNotes] = useState(editLog?.notes || '');
  const [showTreat, setShowTreat] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showMutualMiss, setShowMutualMiss] = useState(false);
  const [submittedLogId, setSubmittedLogId] = useState<string | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(editLog?.photoUrl ?? null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const applyPhotoFile = (file: File) => {
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!status || !user?.id || !pactId) return;

    let photoUrl: string | undefined = editLog?.photoUrl;

    if (photoFile) {
      setIsUploading(true);
      try {
        const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${pactId}/${user.id}/${date}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('workout_photos')
          .upload(path, photoFile, { upsert: true });

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('workout_photos').getPublicUrl(path);
          photoUrl = urlData.publicUrl;
        }
      } finally {
        setIsUploading(false);
      }
    }

    if (editLog) {
      await data.updateWorkoutLog(editLog.id, { date, status, notes: notes || undefined, photoUrl });
    } else {
      const log = await data.addWorkoutLog({
        userId: user.id,
        pactId,
        date,
        status,
        notes: notes || undefined,
        photoUrl,
        treatSelected: null,
        treatResolvedAt: null,
        forgivenBy: null,
      });
      setSubmittedLogId(log.id);
      if (status === 'missed' && log.mutualMiss) {
        setShowMutualMiss(true);
        return;
      }

      if (status === 'missed') {
        // Only open treat selector immediately if all partners have already
        // logged this date. Otherwise the treat is deferred — it surfaces on
        // the dashboard once the partner logs.
        const partnerLogged = data.workoutLogs.some(
          l => l.userId !== user.id && l.date === date,
        );
        if (!partnerLogged) {
          onClose();
          return;
        }
        setShowTreat(true);
        return;
      }
    }

    if (status === 'done') {
      setShowConfetti(true);
      setTimeout(onClose, 1500);
    } else {
      setShowTreat(true);
    }
  };

  if (showConfetti) return <ConfettiCelebration onDone={onClose} />;

  if (showMutualMiss) {
    return (
      <div className="fixed inset-0 bg-foreground/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
        <div className="brutal-card bg-background w-full md:max-w-lg md:rounded-xl rounded-t-2xl rounded-b-none md:rounded-b-xl p-6 animate-bounce-in text-center">
          <p className="text-6xl mb-4">🤝</p>
          <h2 className="text-3xl font-heading text-secondary mb-2">Mutual Miss!</h2>
          <p className="font-mono text-base font-bold text-muted-foreground mb-6">
            You both skipped on the same day. No treats owed — this one cancels out.
            <br /><br />
            Don't let it happen again.
          </p>
          <button onClick={onClose} className="brutal-btn w-full py-4 rounded-xl text-xl font-heading bg-accent text-accent-foreground hover-bounce">
            Understood 🫡
          </button>
        </div>
      </div>
    );
  }

  if (showTreat) {
    return (
      <TreatSelector
        missedUserId={user?.id ?? ''}
        data={data}
        pendingLogIds={[submittedLogId || editLog?.id].filter((id): id is string => !!id)}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-foreground/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="brutal-card bg-background w-full md:max-w-lg md:rounded-xl rounded-t-2xl rounded-b-none md:rounded-b-xl p-6 max-h-[90vh] overflow-y-auto animate-bounce-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-heading text-secondary">
            {editLog ? '✏️ Edit Log' : '🏋️ Log Workout'}
          </h2>
          <button onClick={onClose} className="brutal-btn p-2 rounded-lg bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4">
          <label className="font-mono text-sm font-bold text-muted-foreground uppercase tracking-wider block mb-2">When?</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="w-full brutal-btn bg-card px-4 py-3 rounded-lg font-mono"
          />
        </div>

        <div className="mb-4">
          <label className="font-mono text-sm font-bold text-muted-foreground uppercase tracking-wider block mb-2">Did it happen?</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setStatus('done')}
              className={`brutal-btn py-4 rounded-lg text-xl ${status === 'done' ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              ✅ Done!
            </button>
            <button
              onClick={() => setStatus('missed')}
              className={`brutal-btn py-4 rounded-lg text-xl ${status === 'missed' ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              ❌ Missed
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="font-mono text-sm font-bold text-muted-foreground uppercase tracking-wider block mb-2">
            Sweaty selfie? 📸
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) applyPhotoFile(f); }}
          />
          {photoPreview ? (
            <div className="relative rounded-lg overflow-hidden border-2 border-primary">
              <img src={photoPreview} alt="Workout photo" className="w-full h-48 object-cover" />
              <div className="absolute inset-0 flex items-end justify-between p-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="brutal-btn px-3 py-1 rounded-lg bg-background/90 font-mono text-xs font-bold">
                  Change
                </button>
                <button type="button" onClick={clearPhoto} className="brutal-btn p-1.5 rounded-lg bg-background/90">
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging ? 'border-primary bg-primary/5 text-primary' : 'border-muted-foreground/30 text-muted-foreground hover:border-primary'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) applyPhotoFile(f); }}
            >
              <p className="text-3xl mb-2">📷</p>
              <p className="font-mono text-sm font-bold">Tap to add photo</p>
              <p className="font-mono text-xs mt-1 opacity-60 hidden md:block">or drag & drop</p>
            </div>
          )}
        </div>

        <div className="mb-6">
          <label className="font-mono text-sm font-bold text-muted-foreground uppercase tracking-wider block mb-2">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="How was it? Brag or complain..."
            className="w-full brutal-btn bg-card px-4 py-3 rounded-lg font-body resize-none h-20"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!status || isUploading}
          className={`brutal-btn w-full py-4 rounded-xl text-xl font-heading ${
            status && !isUploading ? 'bg-primary text-primary-foreground hover-bounce' : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          {isUploading ? '⏳ Uploading photo...' : status === 'missed' ? '😬 Submit' : '🔥 Submit'}
        </button>
      </div>
    </div>
  );
}
