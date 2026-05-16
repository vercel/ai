import { describe, expect, it } from 'vitest';
import { bash_20241022 } from './bash_20241022';

describe('bash_20241022 tool', () => {
  it('passes abort signal to sandbox command execution', async () => {
    const abortController = new AbortController();
    let receivedAbortSignal: AbortSignal | undefined;
    const bashTool = bash_20241022();

    await bashTool.execute?.(
      { command: 'ls' },
      {
        toolCallId: 'tool-call-id',
        messages: [],
        abortSignal: abortController.signal,
        context: {},
        experimental_sandbox: {
          description: 'test sandbox',
          runCommand: async ({ abortSignal }) => {
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
