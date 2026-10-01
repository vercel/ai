import { tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import {
  experimental_continueCodeModeInterrupt as continueCodeModeInterrupt,
  experimental_isCodeModeInterrupt as isCodeModeInterrupt,
  experimental_requestCodeModeInterrupt as requestCodeModeInterrupt,
  experimental_runCodeMode as runCodeMode,
  type CodeModeInterrupt,
  type CodeModeToolExecutionOptions,
} from '../dist/index.js';

describe('run compatibility adapter', () => {
  it('supports tool names that are not host-function identifiers', async () => {
    await expect(
      runCodeMode({
        js: `return await tools['lookup-user']({ id: 'user-1' });`,
        tools: {
          'lookup-user': tool({
            inputSchema: z.object({ id: z.string() }),
            execute: async ({ id }) => ({ id }),
          }),
        },
      }),
    ).resolves.toEqual({ id: 'user-1' });
  });

  it('applies maxToolOutputBytes to interrupt resolutions', async () => {
    const tools = {
      authorize: tool({
        inputSchema: z.object({}),
        execute: async (_input, options) => {
          const resume = (options as CodeModeToolExecutionOptions)
            .codeModeInterrupt;
          if (resume === undefined) {
            requestCodeModeInterrupt({ kind: 'authorization' });
          }
          return resume.resolution;
        },
      }),
    };
    const options = {
      executionPolicy: { maxToolOutputBytes: 8 },
    };
    const pending = await runCodeMode({
      js: 'return await tools.authorize({});',
      tools,
      options,
    });

    await expect(
      continueCodeModeInterrupt({
        interrupt: pending as CodeModeInterrupt,
        resolution: { authorized: true },
        tools,
        options,
      }),
    ).rejects.toThrow('exceeds the 8 byte size limit');
  });

  it('accepts legacy short continuation signing keys', async () => {
    const tools = {
      authorize: tool({
        inputSchema: z.object({}),
        execute: async (_input, options) => {
          const resume = (options as CodeModeToolExecutionOptions)
            .codeModeInterrupt;
          if (resume === undefined) {
            requestCodeModeInterrupt({ kind: 'authorization' });
          }
          return resume.resolution;
        },
      }),
    };
    const options = {
      continuationSecurity: { signingKey: 'legacy-key' },
    };

    const pending = await runCodeMode({
      js: 'return await tools.authorize({});',
      tools,
      options,
    });
    expect(isCodeModeInterrupt(pending, options.continuationSecurity)).toBe(
      true,
    );

    await expect(
      continueCodeModeInterrupt({
        interrupt: pending as CodeModeInterrupt,
        resolution: { authorized: true },
        tools,
        options,
      }),
    ).resolves.toEqual({ authorized: true });
  });
});
