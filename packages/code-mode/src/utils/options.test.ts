import { describe, expect, it } from 'vitest';
import {
  experimental_runCodeMode as runCodeMode,
  experimental_setMaxWorkers as setMaxWorkers,
} from '../../dist/index.js';

describe('options validation', () => {
  it.each([
    ['timeoutMs', 0],
    ['memoryLimitBytes', -1],
    ['maxStackSizeBytes', 1.5],
    ['maxResultBytes', Number.NaN],
    ['maxConsoleOutputBytes', 0],
    ['maxSourceBytes', 0],
    ['maxToolInputBytes', 0],
    ['maxToolOutputBytes', 0],
    ['maxBridgeRequests', 0],
    ['maxInFlightBridgeRequests', 0],
  ] as const)(
    'rejects invalid positive integer option %s',
    async (name, value) => {
      await expect(
        runCodeMode({
          js: "return 'unused';",
          tools: {},
          options: { executionPolicy: { [name]: value } },
        }),
      ).rejects.toThrow(
        new RegExp(`executionPolicy\\.${name} must be a positive integer`),
      );
    },
  );

  it('rejects invalid maxWorkers values', () => {
    expect(() => setMaxWorkers(0)).toThrow(
      /maxWorkers must be a positive integer/,
    );
    expect(() => setMaxWorkers(1.5)).toThrow(
      /maxWorkers must be a positive integer/,
    );
  });
});
