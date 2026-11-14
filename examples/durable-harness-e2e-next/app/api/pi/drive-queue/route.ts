import { Agent, DRIVE_QUEUE_PREFIX } from '@/agent/pi/basic';
import { createDriveQueueHandler } from '@/lib/drive-queue';
import { getWorld } from '@/lib/world';

export const maxDuration = 800;

/**
 * Where the World delivers the Pi drive queue (`__harnesspi_wkf_workflow_*`)
 * over HTTP: on Vercel, this Function subscribes to the topic (`vercel.json`).
 * The local World delivers drive messages in process instead
 * (`lib/start-drive-queue.ts`).
 */
export async function POST(request: Request) {
  return createDriveQueueHandler({
    world: getWorld(),
    agent: Agent,
    queuePrefix: DRIVE_QUEUE_PREFIX,
  })(request);
}
