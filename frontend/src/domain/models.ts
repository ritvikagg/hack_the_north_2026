export type PledgeMinor = 500 | 1000 | 2000;
export type ChallengeStatus = 'lobby' | 'active' | 'settled';

export interface User {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface Participant {
  userId: string;
  completedDays: number;
}

export interface Payout {
  userId: string;
  pledgeReturnedMinor: number;
  totalMinor: number;
}

export interface Challenge {
  mode?: 'solo' | 'party';
  charityMinor?: number;
  id: string;
  title: string;
  dailyStepGoal: number;
  requiredDays: number;
  pledgeMinor: PledgeMinor;
  currency: 'CAD';
  hostId: string;
  groupId: string | null;
  status: ChallengeStatus;
  createdAt: string;
  startsAt: string | null;
  endsAt: string | null;
  inviteCode: string;
  participants: Participant[];
  payouts: Payout[];
}

export interface Run {
  id: string;
  challengeId: string;
  userId: string;
  steps: number;
  completedAt: string;
  verification: 'verified' | 'pending' | 'rejected';
  countsTowardGoal: boolean;
  source?: 'demo' | 'gait_sensor';
  gait?: {
    steps: number;
    sampleCount: number;
    cadenceSpm: number;
    reason: string;
  };
}

export interface Group {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  inviteCode: string;
  color: string;
}

export interface DemoState {
  version: 1;
  hasEntered: boolean;
  currentUserId: string;
  users: User[];
  challenges: Challenge[];
  groups: Group[];
  runs: Run[];
}

export interface CreateChallengeInput {
  mode?: 'solo' | 'party';
  dailyStepGoal: number;
  requiredDays: number;
  pledgeMinor: PledgeMinor;
  groupId?: string;
}

export interface PledgefitActions {
  enterDemo(): Promise<void>;
  createChallenge(input: CreateChallengeInput): Promise<string>;
  joinChallenge(code: string): Promise<string>;
  createGroup(name: string): Promise<string>;
  joinGroup(code: string): Promise<string>;
  startChallenge(challengeId: string): Promise<void>;
  addDemoDay(challengeId: string): Promise<void>;
  addDemoFriend(challengeId: string): Promise<void>;
  settleDemoChallenge(challengeId: string): Promise<void>;
  resetDemo(): Promise<void>;
}
