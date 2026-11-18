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
          run: async ({ abortSignal }) => {
            receivedAbortSignal = abortSignal;

            return {
              exitCode: 0,
              stdout: '',
              stderr: '',
            };
          },
          readFile: async () => null,
          readBinaryFile: async () => null,
          readTextFile: async () => null,
          writeFile: async () => {},
          writeBinaryFile: async () => {},
          writeTextFile: async () => {},
          stat: async () => null,
          listDirectory: async () => null,
          deleteFile: async () => false,
          spawn: async () => {
            throw new Error('spawn is not implemented in this mock.');
          },
        },
      },
    );

    expect(receivedAbortSignal).toBe(abortController.signal);
  });
});
