import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePact } from '@/context/PactContext';

type Step = 'profile' | 'pair';

export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const { refreshMembers } = usePact();
  const [step, setStep] = useState<Step>(
    profile?.pactId ? 'pair' : profile?.name ? 'pair' : 'profile',
  );
  const [name, setName] = useState(profile?.name ?? '');
  const [emoji, setEmoji] = useState(profile?.emoji ?? '💪');
  const [saving, setSaving] = useState(false);
  const [partnerEmail, setPartnerEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const [incomingInvite, setIncomingInvite] = useState<{
    id: string;
    fromName: string;
    fromEmoji: string;
  } | null>(null);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const pollExhausted = pollCount >= 10;

  const EMOJIS = ['💪', '🏋️', '🔥', '⚡', '🦁', '🐉', '🌟', '🎯', '🏆', '💃', '🕺', '🐺'];

  useEffect(() => {
    if (!sent && !profile?.pactId) return;
    if (pollExhausted) return;
    const interval = setInterval(async () => {
      await refreshProfile();
      await refreshMembers();
      setPollCount(c => c + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, [sent, profile?.pactId, pollExhausted]);

  async function saveProfile() {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    const { error: err } = await supabase
      .from('profiles')
      .upsert({ id: user!.id, name: name.trim(), emoji }, { onConflict: 'id' });
    setSaving(false);
    if (err) { setError(err.message); return; }
    await refreshProfile();
    setStep('pair');
  }

  async function loadIncomingInvites() {
    setLoadingInvites(true);
    const { data } = await supabase
      .from('pact_invites')
      .select('id, from_user_id, profiles!pact_invites_from_user_id_fkey(name, emoji)')
      .eq('to_user_id', user!.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (data) {
      const p = (data as any).profiles;
      setIncomingInvite({ id: data.id, fromName: p?.name ?? 'Unknown', fromEmoji: p?.emoji ?? '💪' });
    }
    setLoadingInvites(false);
  }

  async function sendInvite() {
    if (!partnerEmail.trim()) return;
    setSending(true);
    setError('');

    const { data: partnerId, error: lookupErr } = await supabase
      .rpc('find_user_by_email', { email: partnerEmail.trim().toLowerCase() });

    if (lookupErr || !partnerId) {
      setError('No user found with that email. They need to sign up first.');
      setSending(false);
      return;
    }

    if (partnerId === user!.id) {
      setError("That's your own email 🙄");
      setSending(false);
      return;
    }

    let pactId = profile?.pactId;

    if (!pactId) {
      const { data: newPactId, error: pactErr } = await supabase.rpc('create_pact', { pact_name: 'The Pact' });
      if (pactErr || !newPactId) {
        setError(pactErr?.message ?? 'Failed to create pact');
        setSending(false);
        return;
      }
      pactId = newPactId;
      await refreshProfile();
    }

    const { error: invErr } = await supabase
      .from('pact_invites')
      .insert({ pact_id: pactId, from_user_id: user!.id, to_user_id: partnerId, status: 'pending' });

    setSending(false);
    if (invErr) { setError(invErr.message); return; }
    setPollCount(0);
    setSent(true);
  }

  async function acceptInvite(inviteId: string) {
    setSaving(true);
    setError('');

    const { error: err } = await supabase.rpc('accept_pact_invite', { invite_id: inviteId });
    setSaving(false);
    if (err) { setError(err.message); return; }
    await refreshProfile();
    await refreshMembers();
  }

  if (step === 'profile') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="brutal-card bg-background max-w-md w-full p-8 animate-bounce-in">
          <h2 className="text-secondary text-center mb-6">👋 Set Up Your Profile</h2>

          <div className="mb-4">
            <label className="font-mono text-sm font-bold text-muted-foreground uppercase tracking-wider block mb-2">
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="What should your pact buddy call you?"
              className="w-full brutal-btn bg-card px-4 py-3 rounded-lg font-body"
            />
          </div>

          <div className="mb-6">
            <label className="font-mono text-sm font-bold text-muted-foreground uppercase tracking-wider block mb-2">
              Pick your emoji
            </label>
            <div className="grid grid-cols-6 gap-2">
              {EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`brutal-btn text-2xl p-2 rounded-lg ${emoji === e ? 'bg-primary' : 'bg-muted'}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-destructive font-mono text-sm font-bold mb-4">{error}</p>}

          <button
            onClick={saveProfile}
            disabled={!name.trim() || saving}
            className={`brutal-btn w-full py-4 rounded-xl text-xl ${
              name.trim() && !saving
                ? 'bg-primary text-primary-foreground hover-bounce'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            {saving ? '⏳ Saving...' : 'Continue →'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="brutal-card bg-background max-w-md w-full p-8 animate-bounce-in space-y-6">
        <h2 className="text-secondary text-center">🔗 Create or Join a Pact</h2>

        <div>
          <p className="font-mono text-sm font-bold text-muted-foreground mb-3">
            Invite someone by their Google account email:
          </p>
          {sent ? (
            <div className="brutal-card bg-success/10 p-4 text-center space-y-2">
              <p className="font-heading text-xl text-success">Invite sent! ✅</p>
              <p className="font-mono text-sm text-muted-foreground">
                Tell them to open The Pact and check for your invite.
              </p>
              <p className="font-mono text-sm text-foreground font-bold">
                Once they accept, The Pact will open automatically. 🎉
              </p>
              {pollExhausted ? (
                <p className="font-mono text-xs text-muted-foreground">
                  Still waiting? Refresh the page or check back later.
                </p>
              ) : (
                <p className="font-mono text-xs text-muted-foreground animate-pulse">
                  ⏳ Checking for acceptance…
                </p>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="email"
                value={partnerEmail}
                onChange={e => setPartnerEmail(e.target.value)}
                placeholder="their@gmail.com"
                className="flex-1 brutal-btn bg-card px-4 py-3 rounded-lg font-body"
              />
              <button
                onClick={sendInvite}
                disabled={!partnerEmail.trim() || sending}
                className={`brutal-btn px-4 py-3 rounded-lg text-lg ${
                  partnerEmail.trim() && !sending
                    ? 'bg-primary text-primary-foreground hover-bounce'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                {sending ? '⏳' : 'Send'}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 border-t-2 border-foreground/20" />
          <span className="font-mono text-sm font-bold text-muted-foreground">OR</span>
          <div className="flex-1 border-t-2 border-foreground/20" />
        </div>

        <div>
          <p className="font-mono text-sm font-bold text-muted-foreground mb-3">
            Already got an invite?
          </p>
          {incomingInvite ? (
            <div className="brutal-card p-4 space-y-3">
              <p className="font-heading text-xl text-secondary">
                {incomingInvite.fromEmoji} {incomingInvite.fromName} wants you to join their pact!
              </p>
              {error && <p className="text-destructive font-mono text-sm font-bold">{error}</p>}
              <button
                onClick={() => acceptInvite(incomingInvite.id)}
                disabled={saving}
                className={`brutal-btn w-full py-3 rounded-xl text-lg ${
                  saving ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-success text-success-foreground hover-bounce'
                }`}
              >
                {saving ? '⏳ Joining...' : '✅ Accept & Join Pact'}
              </button>
              <p className="font-mono text-xs text-muted-foreground text-center">
                Accepting will open The Pact for both of you. 🎉
              </p>
            </div>
          ) : (
            <button
              onClick={loadIncomingInvites}
              disabled={loadingInvites}
              className="brutal-btn w-full py-3 rounded-xl text-lg bg-accent text-accent-foreground hover-bounce"
            >
              {loadingInvites ? '⏳ Checking...' : '🔍 Check for Invites'}
            </button>
          )}
        </div>

        {error && !incomingInvite && (
          <p className="text-destructive font-mono text-sm font-bold">{error}</p>
        )}
      </div>
    </div>
  );
}
