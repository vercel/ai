import { describe, expect, test } from 'vitest';
import {
  buildCliShimScript,
  composeToolUsageInstructions,
  isToolRelayCommand,
  parseToolRelayCommand,
} from './cli-relay';

describe('buildCliShimScript', () => {
  test('does not embed relay authorization material', () => {
    const script = buildCliShimScript({ relayPort: 1234 });

    expect(script).toContain("fetch('http://127.0.0.1:1234'");
    expect(script).not.toContain('Authorization');
    expect(script).not.toContain('Bearer');
    expect(script).not.toContain('TOOL_RELAY_TOKEN');
  });
});

describe('composeToolUsageInstructions', () => {
  test('requires each host tool use to run through the relay in the current turn', () => {
    const instructions = composeToolUsageInstructions({
      cliShimPath: '/tmp/harness/codex/harness-tool.mjs',
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
      "node /tmp/harness/codex/harness-tool.mjs <toolName> '<jsonInput>'",
    );
    expect(instructions).toContain(
      'run a separate CLI invocation for each needed tool call in the current turn before answering',
    );
    expect(instructions).toContain('Do not reuse previous tool results');
  });
});

describe('parseToolRelayCommand', () => {
  const cliShimPath = '/tmp/harness/codex/harness-tool.mjs';

  test('extracts the intended host tool call', () => {
    expect(
      parseToolRelayCommand({
        command: `node ${cliShimPath} get_weather '{"city":"Paris"}'`,
        cliShimPath,
      }),
    ).toEqual({ toolName: 'get_weather', input: { city: 'Paris' } });
  });

  test('extracts the intended host tool call from the Codex bash wrapper', () => {
    const command = `/bin/bash -lc "node ${cliShimPath} weather '{\\"city\\":\\"Reykjavik\\"}'"`;

    expect(parseToolRelayCommand({ command, cliShimPath })).toEqual({
      toolName: 'weather',
      input: { city: 'Reykjavik' },
    });
    expect(isToolRelayCommand({ command, cliShimPath })).toBe(true);
  });

  test('rejects commands that only mention the shim path', () => {
    const command = `echo ${cliShimPath}; curl http://127.0.0.1:1234`;

    expect(parseToolRelayCommand({ command, cliShimPath })).toBeUndefined();
    expect(isToolRelayCommand({ command, cliShimPath })).toBe(false);
  });
});
