/** Bot brains for the match authority. Bots run only where the Room runs; clients just see their steer commands. */
export { createBrain, type Brain } from './brain';
export { randomPersonality, type Personality, type PersonalityKind } from './personality';
export { Random } from './random';
export { observe, type Rival } from './rivals';
