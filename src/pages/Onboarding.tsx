import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

type Step = 'profile' | 'pair';

export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<Step>(profile?.name ? 'pair' : 'profile');
  const [name, setName] = useState(profile?.name ?? '');
  const [emoji, setEmoji] = useState(profile?.emoji ?? '💪');
  const [saving, setSaving] = useState(false);
  const [partnerEmail, setPartnerEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Incoming request
  const [incomingRequest, setIncomingRequest] = useState<{
    id: string;
    fromName: string;
    fromEmoji: string;
  } | null>(null);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const EMOJIS = ['💪', '🏋️', '🔥', '⚡', '🦁', '🐉', '🌟', '🎯', '🏆', '💃', '🕺', '🐺'];

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

  async function loadIncomingRequests() {
    setLoadingRequests(true);
    const { data } = await supabase
      .from('couple_requests')
      .select('id, from_user_id, profiles!couple_requests_from_user_id_fkey(name, emoji)')
      .eq('to_user_id', user!.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (data) {
      const p = (data as any).profiles;
      setIncomingRequest({ id: data.id, fromName: p?.name ?? 'Unknown', fromEmoji: p?.emoji ?? '💪' });
    }
    setLoadingRequests(false);
  }

  async function sendRequest() {
    if (!partnerEmail.trim()) return;
    setSending(true);
    setError('');

    // Look up partner by email via auth.users (requires a function or admin access)
    // We use a Postgres function `find_user_by_email` exposed via RPC
    const { data: partnerData, error: lookupErr } = await supabase
      .rpc('find_user_by_email', { email: partnerEmail.trim().toLowerCase() });

    if (lookupErr || !partnerData) {
      setError('No user found with that email. They need to sign up first.');
      setSending(false);
      return;
    }

    if (partnerData === user!.id) {
      setError("That's your own email 🙄");
      setSending(false);
      return;
    }

    const { error: reqErr } = await supabase
      .from('couple_requests')
      .insert({ from_user_id: user!.id, to_user_id: partnerData, status: 'pending' });

    setSending(false);
    if (reqErr) { setError(reqErr.message); return; }
    setSent(true);
  }

  async function acceptRequest(requestId: string) {
    setSaving(true);
    setError('');

    const { error: err } = await supabase.rpc('accept_couple_request', { request_id: requestId });
    setSaving(false);
    if (err) { setError(err.message); return; }
    await refreshProfile();
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
              placeholder="What should your partner call you?"
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
        <h2 className="text-secondary text-center">🔗 Pair With Your Partner</h2>

        {/* Send request section */}
        <div>
          <p className="font-mono text-sm font-bold text-muted-foreground mb-3">
            Enter your partner's Google account email:
          </p>
          {sent ? (
            <div className="brutal-card bg-success/10 p-4 text-center">
              <p className="font-heading text-xl text-success">Request sent! ✅</p>
              <p className="font-mono text-sm text-muted-foreground mt-1">
                Tell your partner to open The Pact and check for your request.
              </p>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="email"
                value={partnerEmail}
                onChange={e => setPartnerEmail(e.target.value)}
                placeholder="partner@gmail.com"
                className="flex-1 brutal-btn bg-card px-4 py-3 rounded-lg font-body"
              />
              <button
                onClick={sendRequest}
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

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t-2 border-foreground/20" />
          <span className="font-mono text-sm font-bold text-muted-foreground">OR</span>
          <div className="flex-1 border-t-2 border-foreground/20" />
        </div>

        {/* Check for incoming requests */}
        <div>
          <p className="font-mono text-sm font-bold text-muted-foreground mb-3">
            Already got a request from your partner?
          </p>
          {incomingRequest ? (
            <div className="brutal-card p-4 space-y-3">
              <p className="font-heading text-xl text-secondary">
                {incomingRequest.fromEmoji} {incomingRequest.fromName} wants to pair with you!
              </p>
              {error && <p className="text-destructive font-mono text-sm font-bold">{error}</p>}
              <button
                onClick={() => acceptRequest(incomingRequest.id)}
                disabled={saving}
                className={`brutal-btn w-full py-3 rounded-xl text-lg ${
                  saving ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-success text-success-foreground hover-bounce'
                }`}
              >
                {saving ? '⏳ Pairing...' : '✅ Accept & Pair Up'}
              </button>
            </div>
          ) : (
            <button
              onClick={loadIncomingRequests}
              disabled={loadingRequests}
              className="brutal-btn w-full py-3 rounded-xl text-lg bg-accent text-accent-foreground hover-bounce"
            >
              {loadingRequests ? '⏳ Checking...' : '🔍 Check for Requests'}
            </button>
          )}
        </div>

        {error && !incomingRequest && (
          <p className="text-destructive font-mono text-sm font-bold">{error}</p>
        )}
      </div>
    </div>
  );
}
