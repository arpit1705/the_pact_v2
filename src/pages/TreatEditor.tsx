import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { MAX_TREATS_PER_USER } from '@/types';
import type { UserTreat } from '@/types';
import type { AppData } from '@/pages/Dashboard';

interface TreatEditorProps {
  data: AppData;
}

interface TreatForm {
  name: string;
  description: string;
  details: string;
  emoji: string;
}

const EMPTY_FORM: TreatForm = { name: '', description: '', details: '', emoji: '🎁' };

const EMOJI_OPTIONS = ['🎁', '📸', '🎟️', '📖', '💬', '💪', '🥗', '🚿', '🎬', '🔮', '🍗', '🔥', '📚', '🎵', '🧘', '🍰', '💃', '🏃', '🎮', '💋'];

function toKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function TreatEditor({ data }: TreatEditorProps) {
  const { user, profile } = useAuth();
  const myId = user?.id ?? '';
  const myTreats = data.getMyTreats();

  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<TreatForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const canAddMore = myTreats.length < MAX_TREATS_PER_USER;

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setCreating(true);
  };

  const startEdit = (treat: UserTreat) => {
    setForm({ name: treat.name, description: treat.description, details: treat.details, emoji: treat.emoji });
    setEditing(treat.id);
    setCreating(false);
  };

  const cancel = () => {
    setEditing(null);
    setCreating(false);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await data.saveTreat({
        id: editing ?? undefined,
        userId: myId,
        key: editing ? myTreats.find(t => t.id === editing)!.key : toKey(form.name),
        name: form.name.trim(),
        description: form.description.trim(),
        details: form.details.trim(),
        emoji: form.emoji,
      });
      cancel();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (treatId: string) => {
    setDeleting(treatId);
    try {
      await data.deleteTreat(treatId);
    } finally {
      setDeleting(null);
    }
  };

  const isFormOpen = creating || editing !== null;

  return (
    <div className="container space-y-6 pb-8">
      <h2 className="text-4xl md:text-5xl font-heading text-secondary text-center">✏️ My Treats</h2>

      <div className="brutal-card bg-accent/30 p-4 text-center">
        <p className="font-mono text-base font-bold text-muted-foreground">
          {profile?.emoji} {profile?.name}, define up to {MAX_TREATS_PER_USER} treats you earn when someone else misses a workout.
        </p>
        <p className="font-mono text-sm text-muted-foreground mt-1">
          {myTreats.length}/{MAX_TREATS_PER_USER} treats defined
        </p>
      </div>

      {myTreats.length === 0 && !isFormOpen && (
        <div className="brutal-card p-8 text-center">
          <p className="text-5xl mb-4">🎁</p>
          <p className="font-heading text-2xl text-secondary mb-2">No treats yet</p>
          <p className="font-mono text-sm font-bold text-muted-foreground mb-6">
            Add treats you'll earn when your pact buddy misses a workout.
          </p>
          <button onClick={startCreate} className="brutal-btn bg-primary text-primary-foreground px-6 py-3 rounded-xl text-lg font-heading hover-bounce">
            <Plus size={20} className="inline mr-2" />Add Your First Treat
          </button>
        </div>
      )}

      <div className="space-y-3">
        {myTreats.map(treat => {
          if (editing === treat.id) return null;
          const isDeleting = deleting === treat.id;
          return (
            <div key={treat.id} className={`brutal-card p-4 ${isDeleting ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="text-3xl flex-shrink-0">{treat.emoji}</span>
                  <div className="min-w-0">
                    <p className="font-heading text-xl text-secondary">{treat.name}</p>
                    <p className="font-mono text-sm font-bold text-muted-foreground">{treat.description}</p>
                    {treat.details && (
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{treat.details}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => startEdit(treat)}
                    disabled={isFormOpen}
                    className="brutal-btn p-2 rounded-lg bg-accent text-accent-foreground hover-bounce disabled:opacity-50"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(treat.id)}
                    disabled={isDeleting || isFormOpen}
                    className="brutal-btn p-2 rounded-lg bg-destructive/10 text-destructive hover-bounce disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isFormOpen && (
        <div className="brutal-card p-5 border-primary animate-bounce-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-2xl text-secondary">
              {editing ? '✏️ Edit Treat' : '🆕 New Treat'}
            </h3>
            <button onClick={cancel} className="brutal-btn p-2 rounded-lg bg-muted">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Emoji</label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map(e => (
                  <button
                    key={e}
                    onClick={() => setForm(f => ({ ...f, emoji: e }))}
                    className={`text-2xl p-2 rounded-lg border-2 transition-all ${
                      form.emoji === e ? 'border-primary bg-primary/10 scale-110' : 'border-transparent hover:border-muted'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Double Down"
                maxLength={60}
                className="w-full brutal-card px-4 py-3 text-lg font-heading focus:border-primary outline-none"
              />
            </div>

            <div>
              <label className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Short Description</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. 10 push-ups + 30 squats tomorrow"
                maxLength={120}
                className="w-full brutal-card px-4 py-3 text-base focus:border-primary outline-none"
              />
            </div>

            <div>
              <label className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Full Details</label>
              <textarea
                value={form.details}
                onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
                placeholder="Detailed rules / conditions (optional)"
                rows={3}
                maxLength={500}
                className="w-full brutal-card px-4 py-3 text-base focus:border-primary outline-none resize-none"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={!form.name.trim() || saving}
              className={`brutal-btn w-full py-4 rounded-xl text-xl font-heading ${
                form.name.trim() && !saving
                  ? 'bg-primary text-primary-foreground hover-bounce'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              <Check size={20} className="inline mr-2" />
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Treat'}
            </button>
          </div>
        </div>
      )}

      {canAddMore && myTreats.length > 0 && !isFormOpen && (
        <button
          onClick={startCreate}
          className="brutal-btn w-full py-4 rounded-xl text-xl font-heading bg-secondary text-secondary-foreground hover-bounce"
        >
          <Plus size={20} className="inline mr-2" />Add Treat ({myTreats.length}/{MAX_TREATS_PER_USER})
        </button>
      )}
    </div>
  );
}
