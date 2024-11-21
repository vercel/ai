import { Logger } from 'pino';

/**
 * Listens for SIGINT and SIGTERM and terminates the process gracefully.
 *
 * This ensures that running requests, database connections and other operations
 * are finished before the process is terminated.
 */
export function shutdownOnSigTermAndSigInt({
  logger,
  shutdown,
}: {
  logger: Logger;
  shutdown: () => Promise<void>;
}) {
  async function closeGracefully(signal: NodeJS.Signals) {
    logger.info(`Received signal to terminate: ${signal}`);

    await shutdown();

    process.kill(process.pid, signal);
  }

  process.once('SIGINT', closeGracefully);
  process.once('SIGTERM', closeGracefully);
}
