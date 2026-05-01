// ─── Auth / User ──────────────────────────────────────────────────────────────

export interface Profile {
  id: string;         // matches auth.users.id (UUID)
  name: string;
  emoji: string;
  pactId: string | null;
}

// ─── Pact ─────────────────────────────────────────────────────────────────────

export interface Pact {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface PactMember {
  pactId: string;
  userId: string;
  role: 'creator' | 'member';
  joinedAt: string;
}

export interface PactInvite {
  id: string;
  pactId: string | null;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

// ─── Workout ──────────────────────────────────────────────────────────────────

export interface WorkoutLog {
  id: string;
  userId: string;
  pactId: string;
  date: string;
  status: 'done' | 'missed' | 'forgiven';
  photoUrl?: string;
  notes?: string;
  treatSelected: string | null;
  treatResolvedAt: string | null;
  mutualMiss?: boolean;
  forgivenBy: string | null;
}

export type TreatCounts = Record<string, Record<string, { total: number; resolved: number }>>;

export interface ResolutionEvent {
  id: string;
  pactId: string;
  debtorUserId: string;
  treatType: string;
  resolvedBy: string;
  resolvedAt: string;
}

// ─── Treats ───────────────────────────────────────────────────────────────────

export interface TreatOption {
  key: string;
  name: string;
  description: string;
  details: string;
  emoji: string;
}

export interface UserTreat {
  id: string;
  userId: string;
  key: string;
  name: string;
  description: string;
  details: string;
  emoji: string;
  sortOrder: number;
}

export const MAX_TREATS_PER_USER = 6;
