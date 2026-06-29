import { describe, expect, test } from 'vitest';
import { isToolRelayCommand } from './cli-relay';

describe('isToolRelayCommand', () => {
  test('detects command executions that invoke the CLI relay shim', () => {
    expect(
      isToolRelayCommand({
        command: "node /work/harness-tool.mjs get_weather '{}'",
        cliShimPath: '/work/harness-tool.mjs',
      }),
    ).toBe(true);

    expect(
      isToolRelayCommand({
        command: 'pnpm test',
        cliShimPath: '/work/harness-tool.mjs',
      }),
    ).toBe(false);
  });
});
