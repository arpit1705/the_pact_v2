import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface PactMember {
  id: string;
  name: string;
  emoji: string;
}

interface PactContextValue {
  pactId: string | null;
  members: PactMember[];
  hasPactPartner: boolean;
  loading: boolean;
  refreshMembers: () => Promise<void>;
}

const PactContext = createContext<PactContextValue | null>(null);

export function PactProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const pactId = profile?.pactId ?? null;
  const [members, setMembers] = useState<PactMember[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);

  async function fetchMembers(pid: string, uid: string) {
    const { data } = await supabase
      .from('pact_members')
      .select('user_id, profiles(id, name, emoji)')
      .eq('pact_id', pid)
      .neq('user_id', uid);

    if (data) {
      setMembers(
        data.map((row: any) => ({
          id: row.profiles.id,
          name: row.profiles.name,
          emoji: row.profiles.emoji,
        })),
      );
    }
    setInitialLoad(false);
  }

  async function refreshMembers() {
    if (pactId && user?.id) await fetchMembers(pactId, user.id);
  }

  useEffect(() => {
    if (pactId && user?.id) {
      fetchMembers(pactId, user.id);
    } else {
      setMembers([]);
      setInitialLoad(false);
    }
  }, [pactId, user?.id]);

  return (
    <PactContext.Provider value={{ pactId, members, hasPactPartner: members.length > 0, loading: initialLoad, refreshMembers }}>
      {children}
    </PactContext.Provider>
  );
}

export function usePact(): PactContextValue {
  const ctx = useContext(PactContext);
  if (!ctx) throw new Error('usePact must be used within PactProvider');
  return ctx;
}
