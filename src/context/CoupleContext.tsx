import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Profile } from '@/types';

interface CoupleContextValue {
  partner: Profile | null;
  coupleId: string | null;
  partner1Id: string | null; // stable ordering used for treat list assignment
  loading: boolean;
}

const CoupleContext = createContext<CoupleContextValue | null>(null);

export function CoupleProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [partner, setPartner] = useState<Profile | null>(null);
  const [partner1Id, setPartner1Id] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.coupleId) {
      setPartner(null);
      setPartner1Id(null);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      const { data: couple } = await supabase
        .from('couples')
        .select('partner1_id, partner2_id')
        .eq('id', profile!.coupleId)
        .single();

      if (couple) {
        setPartner1Id(couple.partner1_id);
        const partnerId =
          couple.partner1_id === profile!.id ? couple.partner2_id : couple.partner1_id;

        const { data: partnerData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', partnerId)
          .single();

        if (partnerData) {
          setPartner({
            id: partnerData.id,
            name: partnerData.name,
            emoji: partnerData.emoji,
            coupleId: partnerData.couple_id,
          });
        }
      }
      setLoading(false);
    }

    load();
  }, [profile?.coupleId, profile?.id]);

  return (
    <CoupleContext.Provider
      value={{
        partner,
        coupleId: profile?.coupleId ?? null,
        partner1Id,
        loading,
      }}
    >
      {children}
    </CoupleContext.Provider>
  );
}

export function useCouple(): CoupleContextValue {
  const ctx = useContext(CoupleContext);
  if (!ctx) throw new Error('useCouple must be used within CoupleProvider');
  return ctx;
}
