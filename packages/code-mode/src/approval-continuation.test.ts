import { tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import {
  CodeModeToolApprovalDeniedError,
  experimental_continueCodeModeApproval as continueCodeModeApproval,
  experimental_continueCodeModeInterrupt as continueCodeModeInterrupt,
  experimental_isCodeModeApprovalInterrupt as isCodeModeApprovalInterrupt,
  experimental_isCodeModeInterrupt as isCodeModeInterrupt,
  experimental_requestCodeModeInterrupt as requestCodeModeInterrupt,
  experimental_runCodeMode as runCodeMode,
  type CodeModeApprovalInterrupt,
  type CodeModeInterrupt,
  type CodeModeToolExecutionOptions,
} from '../dist/index.js';

describe('code-mode approval continuations', () => {
  it('supports callback approval without interrupting', async () => {
    const execute = vi.fn(async ({ value }: { value: number }) => value * 2);

    await expect(
      runCodeMode({
        js: 'return await tools.sensitive({ value: 2 });',
        tools: {
          sensitive: tool({
            inputSchema: z.object({ value: z.number() }),
            needsApproval: true,
            execute,
          }),
        },
        options: {
          approval: {
            onApprovalRequired: () => 'approved',
          },
        },
      }),
    ).resolves.toBe(4);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('replays completed calls without repeating their side effects', async () => {
    const lookup = vi.fn(async ({ id }: { id: string }) => ({ id }));
    const sensitive = vi.fn(async ({ id }: { id: string }) => ({
      id,
      ok: true,
    }));
    const tools = {
      lookup: tool({
        inputSchema: z.object({ id: z.string() }),
        execute: lookup,
      }),
      sensitive: tool({
        inputSchema: z.object({ id: z.string() }),
        needsApproval: true,
        execute: sensitive,
      }),
    };

    const pending = await runCodeMode({
      js: `
        const first = await tools.lookup({ id: 'item-1' });
        const second = await tools.sensitive({ id: first.id });
        return { first, second };
      `,
      tools,
      toolExecutionOptions: { toolCallId: 'outer', messages: [] },
      options: { approval: { mode: 'interrupt' } },
    });

    expect(isCodeModeApprovalInterrupt(pending)).toBe(true);
    const interrupt = pending as CodeModeApprovalInterrupt;
    expect(interrupt.toolName).toBe('sensitive');
    expect(interrupt.interruptId).toBe('outer:tool-2:interrupt');
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(sensitive).not.toHaveBeenCalled();

    await expect(
      continueCodeModeApproval({
        interrupt,
        approvalResponse: {
          approvalId: interrupt.interruptId,
          approved: true,
        },
        tools,
      }),
    ).resolves.toEqual({
      first: { id: 'item-1' },
      second: { id: 'item-1', ok: true },
    });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(sensitive).toHaveBeenCalledTimes(1);
  });

  it('denies an approval without executing the pending tool', async () => {
    const execute = vi.fn(async () => 'should not run');
    const tools = {
      sensitive: tool({
        inputSchema: z.object({}),
        needsApproval: true,
        execute,
      }),
    };
    const pending = await runCodeMode({
      js: 'return await tools.sensitive({});',
      tools,
      options: { approval: { mode: 'interrupt' } },
    });
    expect(isCodeModeApprovalInterrupt(pending)).toBe(true);
    const interrupt = pending as CodeModeApprovalInterrupt;

    await expect(
      continueCodeModeApproval({
        interrupt,
        approvalResponse: {
          approvalId: interrupt.interruptId,
          approved: false,
          reason: 'not allowed',
        },
        tools,
      }),
    ).rejects.toBeInstanceOf(CodeModeToolApprovalDeniedError);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects interrupt envelopes that do not match the signed ledger', async () => {
    const pending = await runCodeMode({
      js: 'return await tools.sensitive({});',
      tools: {
        sensitive: tool({
          inputSchema: z.object({}),
          needsApproval: true,
          execute: async () => 'ok',
        }),
      },
      options: { approval: { mode: 'interrupt' } },
    });
    expect(isCodeModeApprovalInterrupt(pending)).toBe(true);

    const forged = {
      ...(pending as CodeModeApprovalInterrupt),
      toolName: 'different',
    };
    expect(isCodeModeApprovalInterrupt(forged)).toBe(false);
  });

  it('exposes run approval batches one at a time', async () => {
    const first = vi.fn(async () => 'first');
    const second = vi.fn(async () => 'second');
    const tools = {
      first: tool({
        inputSchema: z.object({}),
        needsApproval: true,
        execute: first,
      }),
      second: tool({
        inputSchema: z.object({}),
        needsApproval: true,
        execute: second,
      }),
    };

    const pendingFirst = await runCodeMode({
      js: `
        const [first, second] = await Promise.all([
          tools.first({}),
          tools.second({}),
        ]);
        return { first, second };
      `,
      tools,
      toolExecutionOptions: { toolCallId: 'outer', messages: [] },
      options: { approval: { mode: 'interrupt' } },
    });
    expect(isCodeModeApprovalInterrupt(pendingFirst)).toBe(true);

    const firstInterrupt = pendingFirst as CodeModeApprovalInterrupt;
    const pendingSecond = await continueCodeModeApproval({
      interrupt: firstInterrupt,
      approvalResponse: {
        approvalId: firstInterrupt.interruptId,
        approved: true,
      },
      tools,
    });
    expect(isCodeModeApprovalInterrupt(pendingSecond)).toBe(true);
    // `run` requires the complete interruption batch to be resolved together,
    // so code mode collects each decision before replaying any tool.
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    const secondInterrupt = pendingSecond as CodeModeApprovalInterrupt;
    await expect(
      continueCodeModeApproval({
        interrupt: secondInterrupt,
        approvalResponse: {
          approvalId: secondInterrupt.interruptId,
          approved: true,
        },
        tools,
      }),
    ).resolves.toEqual({ first: 'first', second: 'second' });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('supports generic host interruptions', async () => {
    const tools = {
      connection: tool({
        inputSchema: z.object({}),
        execute: async (_input, options) => {
          const interruption = (options as CodeModeToolExecutionOptions)
            .codeModeInterrupt;
          if (interruption === undefined) {
            requestCodeModeInterrupt({ kind: 'connection-auth' });
          }
          return interruption.resolution;
        },
      }),
    };

    const pending = await runCodeMode({
      js: 'return await tools.connection({});',
      tools,
    });
    expect(isCodeModeInterrupt(pending)).toBe(true);

    await expect(
      continueCodeModeInterrupt({
        interrupt: pending as CodeModeInterrupt,
        resolution: { token: 'ready' },
        tools,
      }),
    ).resolves.toEqual({ token: 'ready' });
  });
});
