import { tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, test } from 'vitest';
import { z } from 'zod/v4';
import type { HarnessV2 } from '../../v2/harness-v2';
import type { HarnessV2BuiltinTool } from '../../v2/harness-v2-builtin-tool';
import type { HarnessAgentSandboxSessionResolver } from './harness-agent-session';
import { HarnessAgent } from './harness-agent';

declare const harness: HarnessV2<{
  writeFile: HarnessV2BuiltinTool<{ path: string }>;
}>;
declare const getSandboxSession: HarnessAgentSandboxSessionResolver;

describe('HarnessAgent v2 tool types', () => {
  test('includes built-in and user tools', () => {
    const agent = new HarnessAgent({
      harness,
      getSandboxSession,
      tools: { weather: tool({ inputSchema: z.object({ city: z.string() }) }) },
    });

    expectTypeOf(agent.tools).toHaveProperty('writeFile');
    expectTypeOf(agent.tools).toHaveProperty('weather');
  });

  test('rejects user tools with the names of built-in tools', () => {
    new HarnessAgent({
      harness,
      getSandboxSession,
      tools: {
        // @ts-expect-error a user tool cannot have the name of a built-in tool
        writeFile: tool({ inputSchema: z.object({ path: z.string() }) }),
      },
    });
  });
});
