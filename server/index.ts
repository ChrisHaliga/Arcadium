/**
 * Match server entry point.
 *   PORT    listening port (default 8787)
 *   REGION  name reported to clients and in /stats (default 'local')
 * Stops gracefully on SIGTERM (container stop) and SIGINT (Ctrl+C).
 */
import { createServer, PLAY_PATH } from './server';

const DEFAULT_PORT = 8787;

const port = Number(process.env.PORT ?? DEFAULT_PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`PORT must be a port number, got "${process.env.PORT}"`);
  process.exit(1);
}
const region = process.env.REGION || 'local';

const server = await createServer({ port, region });
console.log(`Landgrab match server, region ${region}: ws://localhost:${server.port}${PLAY_PATH}`);

let stopping = false;
const stop = (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: closing rooms and shutting down`);
  void server.close().then(() => process.exit(0));
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
