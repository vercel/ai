import {
  agent as fxAgent,
  DRIVE_QUEUE_PREFIX as FX_DRIVE_QUEUE_PREFIX,
} from '@/agent/fx/basic';
import {
  agent as piAgent,
  DRIVE_QUEUE_PREFIX as PI_DRIVE_QUEUE_PREFIX,
} from '@/agent/pi/basic';
import {
  createDriveQueueHandler,
  recoverDrives,
  type DriveQueueAgent,
  type DriveQueuePrefix,
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
 * Starts consuming the drive queues in this process and recovers the
 * sessions a dead process left unfinished. Called once at server startup.
 *
 * Only on the local World: its queue lives in this process's memory, so it
 * delivers drive messages to a handler registered here, and a crash loses
 * every message in flight, which is why every unfinished session is sent a
 * new drive message at startup. On Vercel, each queue delivers to its
 * harness's drive route (`app/api/<harness>/drive-queue`), and redelivers
 * the message of a crashed drive itself.
 */
export async function startDriveQueue(): Promise<void> {
  if (getWorldName() !== 'local') return;

  const world: InProcessQueueWorld = getWorld();
  if (world.registerHandler == null) {
    throw new Error(
      'The local World cannot deliver queue messages in process.',
    );
  }
  const queues: Array<{
    agent: DriveQueueAgent<unknown> & { harnessId: string };
    queuePrefix: DriveQueuePrefix;
  }> = [
    { agent: piAgent, queuePrefix: PI_DRIVE_QUEUE_PREFIX },
    { agent: fxAgent, queuePrefix: FX_DRIVE_QUEUE_PREFIX },
  ];
  for (const { agent, queuePrefix } of queues) {
    world.registerHandler(
      queuePrefix,
      createDriveQueueHandler({ world, agent, queuePrefix }),
    );
  }
  await world.start?.();

  for (const { agent, queuePrefix } of queues) {
    const count = await recoverDrives({
      world,
      queuePrefix,
      workflowName: `workflow//@ai-sdk/harness//${agent.harnessId}`,
    });
    console.log(
      `[drive-queue] sent ${count} ${agent.harnessId} recovery drive message(s)`,
    );
  }
}
