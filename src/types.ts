// ─── Auth / User ──────────────────────────────────────────────────────────────

export interface Profile {
  id: string;         // matches auth.users.id (UUID)
  name: string;
  emoji: string;
  coupleId: string | null;
}

// ─── Couple ───────────────────────────────────────────────────────────────────

export interface Couple {
  id: string;
  partner1Id: string;
  partner2Id: string;
  createdAt: string;
}

export interface CoupleRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

// ─── Workout ──────────────────────────────────────────────────────────────────

export interface WorkoutLog {
  id: string;
  userId: string;
  coupleId: string;
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
  coupleId: string;
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

// The treat lists are intentionally kept as-is (Arpit & Madhu's personal choices).
// In a future version these could be couple-configurable in the DB.

export const ARPIT_PICKS: TreatOption[] = [
  {
    key: 'thirst-trap',
    name: 'Thirst Trap on Demand',
    description: 'Yours to request. No excuses.',
    details: 'Must deliver one high-effort, well-lit, genuinely sexy photo. Pose to be specified. No lazy, half-hearted, or poorly lit submissions accepted.',
    emoji: '📸',
  },
  {
    key: 'oral-credit',
    name: 'Oral Pleasure Credit',
    description: 'Redeemable at any time. Non-negotiable.',
    details: 'One token added to the redeemable counter. Can be cashed in at any future time during an in-person visit. Token holder is entirely horizontal and uninvolved — the debtor does all the work.',
    emoji: '🎟️',
  },
  {
    key: 'story-time',
    name: 'Story Time',
    description: 'Sit back and enjoy a bedtime story.',
    details: 'Must conduct one dedicated bedtime storytelling session that evening, with full attention, no distractions, and phone face-down. Topic chosen by the storyteller. Goal: put the other person to sleep.',
    emoji: '📖',
  },
  {
    key: 'difficult-convo',
    name: 'Difficult Conversation',
    description: 'Time to talk about that thing.',
    details: 'Must openly discuss one topic they would normally avoid — without getting defensive, dismissive, or angry. Genuine openness required for the full duration.',
    emoji: '💬',
  },
  {
    key: 'double-down',
    name: 'Double Down',
    description: 'They do 10 push-ups + 30 squats tomorrow. Evidence required.',
    details: 'Must complete 10 push-ups AND 30 squats the following day, in addition to the regular workout. Evidence required.',
    emoji: '💪',
  },
  {
    key: 'salad-sentence',
    name: 'Salad Sentence',
    description: 'Their dinner is salad only tonight.',
    details: 'Dinner that evening shall consist of salad only. No exceptions, no sneaky additions.',
    emoji: '🥗',
  },
];

export const MADHU_PICKS: TreatOption[] = [
  {
    key: 'video-shower',
    name: 'Video Call Shower',
    description: 'Exactly what it sounds like.',
    details: "Must shower on a video call in the other party's presence. Non-negotiable and cannot be substituted.",
    emoji: '🚿',
  },
  {
    key: 'watch-together',
    name: 'Watch Something Together',
    description: 'Your pick. No complaints.',
    details: "Must watch a show or movie of the other party's choosing, together, that night. No skipping, no falling asleep, no phone during the show.",
    emoji: '🎬',
  },
  {
    key: 'future-convo',
    name: 'Future Conversation',
    description: 'Talk about where this is going.',
    details: 'Must discuss a future-related topic selected by the other party — without being dismissive, avoidant, or in denial. Full presence and genuine engagement required.',
    emoji: '🔮',
  },
  {
    key: 'non-veg',
    name: 'Non-Veg Commitment',
    description: 'Eat something adventurous.',
    details: 'Must consume chicken or another non-vegetarian item (excluding eggs) at least once within the next 15 days.',
    emoji: '🍗',
  },
  {
    key: 'sexual-teasing',
    name: 'Sexual Teasing',
    description: 'All tease, no release. Enjoy.',
    details: 'Must tease the other party sexually in a form of their choosing — may include a nude, a sext, or an explicit voice note. Effort and intent are mandatory.',
    emoji: '🔥',
  },
  {
    key: 'read-discuss',
    name: 'Read and Discuss',
    description: 'Read an article/chapter, then discuss.',
    details: 'Must read whatever material is sent, in its entirety, and engage in a meaningful discussion afterward. "I read it" without discussion is not sufficient.',
    emoji: '📚',
  },
];

// Returns treat options that the PARTNER gets to pick when userId missed.
// partner1 misses → partner2 picks from ARPIT_PICKS (slot 1 picks)
// partner2 misses → partner1 picks from MADHU_PICKS (slot 2 picks)
// For now these are fixed to the original lists; future: store per-couple in DB.
export function getTreatOptions(missedUserId: string, partner1Id: string): TreatOption[] {
  return missedUserId === partner1Id ? ARPIT_PICKS : MADHU_PICKS;
}

export function getAllTreatsForUser(userId: string, partner1Id: string): TreatOption[] {
  return userId === partner1Id ? ARPIT_PICKS : MADHU_PICKS;
}
