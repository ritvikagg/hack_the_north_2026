// Stub marketplace data — no real redemption logic needed for the demo.
import { RewardPartner } from '../types';

export const REWARD_PARTNERS: RewardPartner[] = [
  { id: 'p1', name: 'Gymshark', logoEmoji: '🦈', creditCost: 20, description: '$20 off activewear' },
  { id: 'p2', name: 'Juice Bar', logoEmoji: '🥤', creditCost: 8, description: 'Free smoothie' },
  { id: 'p3', name: 'Local Coffee', logoEmoji: '☕', creditCost: 5, description: '$5 credit' },
];
