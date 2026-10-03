/** Getting a MatchClient: the fastest online server, or a room running in this tab for offline play. */
import type { GameServices } from '../../../shared/services';
import { GAME_ID } from '../config';
import { connectOnline, createLocalMatch, createMatchClient, gameServers, type HelloProfile, type MatchClient } from '../net';

export type ConnectMode = 'online' | 'offline';

/** A joined match plus whatever has to be shut down with it. */
export interface Connection {
  client: MatchClient;
  /** Offline only: holds or restarts the room in this tab. An online match plays on without you. */
  setPaused?(paused: boolean): void;
  dispose(): void;
}

export function helloProfile(services: GameServices): HelloProfile {
  return {
    id: services.profile.playerId,
    name: services.profile.name.peek(),
    color: services.profile.color.peek(),
    cosmetics: services.profile.loadout(GAME_ID),
  };
}

/** Rejects with the net layer's JoinError when no match could be joined. */
export async function connect(mode: ConnectMode, profile: HelloProfile, spectate = false): Promise<Connection> {
  if (mode === 'online') {
    const client = await connectOnline(gameServers(), profile);
    return { client, dispose: () => client.dispose() };
  }
  const host = createLocalMatch();
  try {
    const client = await createMatchClient(host.transport, profile, spectate);
    return {
      client,
      setPaused: (paused) => host.setPaused(paused),
      dispose() {
        client.dispose();
        host.dispose();
      },
    };
  } catch (error) {
    host.dispose();
    throw error;
  }
}
