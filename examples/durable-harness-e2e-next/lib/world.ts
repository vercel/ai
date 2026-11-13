import type { World } from '@workflow/world';
import { createWorld as createLocalWorld } from '@workflow/world-local';
import { createWorld as createVercelWorld } from '@workflow/world-vercel';

/**
 * Name of a World this app can run on.
 */
export type WorldName = 'local' | 'vercel';

/**
 * Returns the World for the current environment: `HARNESS_WORLD` if set,
 * otherwise the Vercel World on Vercel and the local World everywhere else.
 */
export function getWorldName(): WorldName {
  const name =
    process.env.HARNESS_WORLD || (process.env.VERCEL ? 'vercel' : 'local');
  if (name !== 'local' && name !== 'vercel') {
    throw new Error(`HARNESS_WORLD must be local or vercel (got ${name}).`);
  }
  return name;
}

const worldGlobal = globalThis as { __durableHarnessE2EWorld?: World };

/**
 * Returns the process's World, created on first use.
 *
 * It is cached on `globalThis`, since Next compiles route handlers into
 * separate module graphs and every route must share one World instance.
 *
 * The local World's own recovery of active runs is turned off: it would
 * re-enqueue the sessions' runs to the Workflow SDK's queue, which this app
 * does not consume.
 */
export function getWorld(): World {
  worldGlobal.__durableHarnessE2EWorld ??=
    getWorldName() === 'vercel'
      ? createVercelWorld()
      : createLocalWorld({
          dataDir: process.env.WORKFLOW_LOCAL_DATA_DIR ?? '.workflow-data',
          recoverActiveRuns: false,
        });
  return worldGlobal.__durableHarnessE2EWorld;
}
