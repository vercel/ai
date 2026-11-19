import type { HarnessV2 } from '@ai-sdk/harness';
import { FX_BUILTIN_TOOLS } from './fx-builtin-tools';
import { FxDrive } from './fx-drive';
import { createFxModelRuntime } from './fx-model-runtime';

/**
 * Creates the fx harness adapter, which drives durable `HarnessAgent`
 * sessions with fx's agent engine from libfx running in the host process.
 *
 * fx's conversation lives only in the session log: every turn runs on a new
 * libfx engine restored from the checkpoint recorded after the previous
 * turn, and every model call and tool call is recorded, so a session
 * continues in any process. fx's kernel tools (`read_file`, `glob_files`,
 * `grep_files`, `edit_file`, `write_file` and `shell`) operate on the
 * session's sandbox. Models are reached through AI Gateway
 * (`AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`); a turn's `model` setting
 * selects the model, `spacexai/grok-4.7` (libfx's default) by default.
 */
export function createFx(): HarnessV2<typeof FX_BUILTIN_TOOLS> {
  return {
    specificationVersion: 'harness-v2',
    harnessId: 'fx',
    builtinTools: FX_BUILTIN_TOOLS,
    async drive({ sessionId, context }) {
      const runtime = createFxModelRuntime();
      await new FxDrive({ sessionId, context, runtime }).run();
    },
  };
}

/**
 * Default instance of the fx harness adapter.
 */
export const fx = createFx();
