/**
 * Who may open a connection. Caps on the total and on each client address keep one
 * machine from crowding everyone else off a server, or running it out of memory, for
 * the price of a few dozen sockets.
 */
import type { IncomingMessage } from 'node:http';
import { BlockList } from 'node:net';

/** About what one core serves (each player costs ~0.2% of a core); beyond it every match would lag. */
const MAX_CONNECTIONS = 500;
/** A household or a classroom behind one address still fits; one machine can't hold more than two rooms' worth. */
const MAX_CONNECTIONS_PER_ADDRESS = 32;

/** Peers whose X-Forwarded-For is believed: the reverse proxy runs on the same private network (docs/SHIPPING.md). */
const PRIVATE_NETWORKS = new BlockList();
PRIVATE_NETWORKS.addSubnet('10.0.0.0', 8);
PRIVATE_NETWORKS.addSubnet('172.16.0.0', 12);
PRIVATE_NETWORKS.addSubnet('192.168.0.0', 16);
PRIVATE_NETWORKS.addSubnet('127.0.0.0', 8);
PRIVATE_NETWORKS.addAddress('::1', 'ipv6');
PRIVATE_NETWORKS.addSubnet('fc00::', 7, 'ipv6');

export class Admission {
  private total = 0;
  private readonly perAddress = new Map<string, number>();

  /** The HTTP status that refuses a new connection from `address`, or null to admit it. */
  refusal(address: string): string | null {
    if (this.total >= MAX_CONNECTIONS) return '503 Service Unavailable';
    if ((this.perAddress.get(address) ?? 0) >= MAX_CONNECTIONS_PER_ADDRESS) return '429 Too Many Requests';
    return null;
  }

  /** Counts a connection from `address` until the returned function is called (once, when it closes). */
  admit(address: string): () => void {
    this.total++;
    this.perAddress.set(address, (this.perAddress.get(address) ?? 0) + 1);
    return () => {
      this.total--;
      const left = this.perAddress.get(address)! - 1;
      if (left > 0) this.perAddress.set(address, left);
      else this.perAddress.delete(address);
    };
  }
}

/**
 * The address a request comes from. Behind the reverse proxy every socket comes from the
 * proxy, which appends the real client to X-Forwarded-For. The header is only believed
 * from a private-network peer, so nobody can choose their own address by sending it
 * straight to the server.
 */
export function clientAddress(req: IncomingMessage): string {
  const peer = req.socket.remoteAddress ?? '';
  const forwarded = req.headersDistinct['x-forwarded-for'];
  if (forwarded === undefined || !isPrivate(peer)) return peer;
  const hops = forwarded.join(',').split(',');
  return hops[hops.length - 1].trim() || peer;
}

function isPrivate(address: string): boolean {
  return address !== '' && PRIVATE_NETWORKS.check(address, address.includes(':') ? 'ipv6' : 'ipv4');
}
