import type { HarnessV2 } from '@ai-sdk/harness';
import { PI_BUILTIN_TOOLS } from './pi-builtin-tools';
import { PiDrive } from './pi-drive';
import { createPiModelRuntime } from './pi-model-runtime';

/**
 * Creates the Pi harness adapter, which drives durable `HarnessAgent`
 * sessions with Pi's agent loop (`@earendil-works/pi-agent-core`) running in
 * the host process.
 *
 * Pi's session lives only in the session log: every drive rebuilds Pi's
 * agent from the recorded model calls and tool calls, so a session continues
 * in any process. Pi's built-in tools (`read`, `write`, `edit`, `bash`,
 * `grep`, `find` and `ls`) operate on the session's sandbox. Models are
 * reached through AI Gateway (`AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`);
 * a turn's `model` setting selects the model, `anthropic/claude-sonnet-4.6`
 * by default.
 */
export function createPi(): HarnessV2<typeof PI_BUILTIN_TOOLS> {
  return {
    specificationVersion: 'harness-v2',
    harnessId: 'pi',
    builtinTools: PI_BUILTIN_TOOLS,
    async drive({ sessionId, context }) {
      const runtime = createPiModelRuntime();
      await new PiDrive({ sessionId, context, runtime }).run();
    },
  };
}

/**
 * Default instance of the Pi harness adapter.
 */
export const pi = createPi();
