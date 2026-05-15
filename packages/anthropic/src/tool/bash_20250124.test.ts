import { describe, expect, it } from 'vitest';
import { bash_20250124 } from './bash_20250124';

describe('bash_20250124 tool', () => {
  it('passes abort signal to sandbox command execution', async () => {
    const abortController = new AbortController();
    let receivedAbortSignal: AbortSignal | undefined;
    const bashTool = bash_20250124();

    await bashTool.execute?.(
      { command: 'ls' },
      {
        toolCallId: 'tool-call-id',
        messages: [],
        abortSignal: abortController.signal,
        context: {},
        experimental_sandbox: {
          description: 'test sandbox',
          executeCommand: async ({ abortSignal }) => {
            receivedAbortSignal = abortSignal;

            return {
              exitCode: 0,
              stdout: '',
              stderr: '',
            };
          },
        },
      },
    );

    expect(receivedAbortSignal).toBe(abortController.signal);
  });
});
