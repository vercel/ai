import { dirname, join, relative, resolve, sep } from 'node:path';
import { DURABLE_HARNESS_AGENT_QUEUE_PREFIX } from '../agent/v2/internal/durable-agent-queue';
import {
  findNextAppDir,
  findOwnQueueHandlerRouteFile,
  getQueueHandlerRouteDir,
} from '../next/queue-handler-route-file';

/**
 * Value for the `functions` property of `vercel.ts`, to merge with the app's
 * own entries: the queue handler route's queue trigger.
 *
 * The entry is for the queue handler route of a Next.js app (an `app` or
 * `src/app` directory): the app's own route file at the route's path, or
 * else the one `withDurableHarnessAgent` writes. Throws without an app
 * directory.
 *
 * ```ts
 * // vercel.ts
 * import { createDurableHarnessAgentVercelFunctionsConfig } from '@ai-sdk/harness/vercel';
 *
 * export const config = {
 *   functions: createDurableHarnessAgentVercelFunctionsConfig(),
 * };
 * ```
 */
export function createDurableHarnessAgentVercelFunctionsConfig(options?: {
  /**
   * The project directory, where `vercel.ts` is. Defaults to the directory
   * of the `vercel.ts` the Vercel CLI loads, or else the working directory.
   */
  projectDir?: string;
}): Record<
  string,
  {
    maxDuration: number | 'max';
    experimentalTriggers: Array<{
      type: 'queue/v2beta';
      topic: string;
      retryAfterSeconds: number;
      initialDelaySeconds: number;
    }>;
  }
> {
  const projectDir = options?.projectDir ?? getDefaultProjectDir();
  const appDir = findNextAppDir({ projectDir });
  if (appDir == null) {
    throw new Error(
      `createDurableHarnessAgentVercelFunctionsConfig: no Next.js app directory (app or src/app) in ${projectDir}. Pass \`projectDir\` if this is not the project directory.`,
    );
  }
  const routeFile =
    findOwnQueueHandlerRouteFile({ appDir }) ??
    join(getQueueHandlerRouteDir({ appDir }), 'route.js');
  return {
    [relative(projectDir, routeFile).split(sep).join('/')]: {
      maxDuration: 'max',
      experimentalTriggers: [
        {
          type: 'queue/v2beta',
          topic: `${DURABLE_HARNESS_AGENT_QUEUE_PREFIX}*`,
          retryAfterSeconds: 5,
          initialDelaySeconds: 0,
        },
      ],
    },
  };
}

/**
 * The directory of the `vercel.ts` the Vercel CLI loads, or else the working
 * directory. The CLI loads `vercel.ts` through a loader script in the
 * project's `.vercel` directory, from a process whose working directory may
 * be another one (in a monorepo, the repository root).
 */
function getDefaultProjectDir(): string {
  for (const arg of process.argv.slice(1, 3)) {
    if (arg && /[\\/]\.vercel[\\/]vercel-(?:loader|temp)\.mjs$/.test(arg)) {
      return dirname(dirname(resolve(arg)));
    }
  }
  return process.cwd();
}
