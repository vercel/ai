import { describe, expect, it } from 'vitest';
import { withReplayScenarioAgent } from './e2e-scenario';
import { shouldRunScenario } from './e2e-shared';
import { REPLAY_ADAPTERS } from './replay-adapters';
import { addTool } from './tools';

/*
 * Tier-A core suite — exercises the full real-CLI pipeline (real adapter, real
 * bridge/proxy or host fetch) against recorded model HTTP. The first scenarios
 * proven end-to-end; more Tier-A scenarios are added the same way once these are
 * green in replay.
 *
 * Runs under the integration config only; each test self-skips unless its
 * fixture exists (replay) or recording is requested with credentials present.
 */
const TOOL_PROMPT =
  'Use the add tool to compute 21 + 21, then reply with only the resulting number.';
const SCENARIO_TIMEOUT_MS = 120_000;

for (const adapter of REPLAY_ADAPTERS) {
  describe(`core: ${adapter.name}`, () => {
    it.skipIf(!shouldRunScenario(adapter.name, 'generate-tool'))(
      'generate() executes a custom tool',
      async () => {
        await withReplayScenarioAgent(
          {
            adapterName: adapter.name,
            scenario: 'generate-tool',
            tools: { add: addTool() },
          },
          async ({ agent, session }) => {
            const result = await agent.generate({
              session,
              prompt: TOOL_PROMPT,
            });
            const toolCalls = await result.toolCalls;
            expect(toolCalls.map(call => call.toolName)).toContain('add');
          },
        );
      },
      SCENARIO_TIMEOUT_MS,
    );

    it.skipIf(!shouldRunScenario(adapter.name, 'stream-tool'))(
      'stream() yields a tool-call part',
      async () => {
        await withReplayScenarioAgent(
          {
            adapterName: adapter.name,
            scenario: 'stream-tool',
            tools: { add: addTool() },
          },
          async ({ agent, session }) => {
            const result = await agent.stream({ session, prompt: TOOL_PROMPT });
            const partTypes: string[] = [];
            for await (const part of result.fullStream) {
              partTypes.push(part.type);
            }
            expect(partTypes).toContain('tool-call');
          },
        );
      },
      SCENARIO_TIMEOUT_MS,
    );
  });
}
