import { describe, expect, test } from 'vitest';
import { composeToolUsageInstructions } from './cli-relay';

describe('composeToolUsageInstructions', () => {
  test('requires each host tool use to run through the relay in the current turn', () => {
    const instructions = composeToolUsageInstructions({
      cliShimPath: '/work/harness-tool.mjs',
      tools: [
        {
          name: 'get_weather',
          description: 'Get weather',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      ],
    });

    expect(instructions).toContain(
      "node /work/harness-tool.mjs <toolName> '<jsonInput>'",
    );
    expect(instructions).toContain(
      'run a separate CLI invocation for each needed tool call in the current turn before answering',
    );
    expect(instructions).toContain('Do not reuse previous tool results');
  });
});
