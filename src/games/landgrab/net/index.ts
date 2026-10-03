/** Networking: match clients with prediction, the offline host, online matchmaking and transports. */
export { createMatchClient, JoinError } from './client';
export { createLocalMatch } from './localHost';
export { connectOnline, gameServers } from './servers';
export type { MatchClient, MatchStatus, LocalMatchOptions } from './contract';
export type { HelloProfile, Transport } from './protocol';
