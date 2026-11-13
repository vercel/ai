import { Agent } from '@/agent/pi/basic';
import {
  createDriveQueueHandler,
  DRIVE_QUEUE_PREFIX,
  recoverDrives,
} from '@/lib/drive-queue';
import { getWorld, getWorldName } from '@/lib/world';
import type { World } from '@workflow/world';

/**
 * A World whose queue can deliver a prefix to a handler in this process
 * (world-local), instead of over HTTP.
 */
type InProcessQueueWorld = World & {
  registerHandler?: (
    prefix: string,
    handler: (request: Request) => Promise<Response>,
  ) => void;
};

/**
 * Starts consuming the drive queue in this process and recovers the
 * sessions a dead process left unfinished. Called once at server startup.
 *
 * Only on the local World: its queue lives in this process's memory, so it
 * delivers drive messages to a handler registered here, and a crash loses
 * every message in flight, which is why every unfinished session is sent a
 * new drive message at startup. On Vercel, the queue delivers to the drive
 * route (`app/api/drive-queue`), and redelivers the
 * message of a crashed drive itself.
 */
export async function startDriveQueue(): Promise<void> {
  if (getWorldName() !== 'local') return;

  const world: InProcessQueueWorld = getWorld();
  if (world.registerHandler == null) {
    throw new Error(
      'The local World cannot deliver queue messages in process.',
    );
  }
  world.registerHandler(
    DRIVE_QUEUE_PREFIX,
    createDriveQueueHandler({ world, agent: Agent }),
  );
  await world.start?.();

  const count = await recoverDrives({
    world,
    workflowName: `workflow//@ai-sdk/harness//${Agent.harnessId}`,
  });
  console.log(`[drive-queue] sent ${count} recovery drive message(s)`);
}
