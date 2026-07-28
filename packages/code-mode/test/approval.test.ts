import { tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  CodeModeToolApprovalDeniedError,
  CodeModeToolApprovalRequiredError,
  runCodeMode,
} from '../dist/index.js';

describe('approval behavior', () => {
  it('does not execute approval-required tools without a callback', async () => {
    const execute = vi.fn(async () => 'should not run');

    await expect(
      runCodeMode({
        js: 'return await tools.sensitive({});',
        tools: {
          sensitive: tool({
            inputSchema: z.object({}),
            needsApproval: true,
            execute,
          }),
        },
      }),
    ).rejects.toBeInstanceOf(CodeModeToolApprovalRequiredError);
    expect(execute).not.toHaveBeenCalled();
  });

  it('executes approval-required tools when callback approves', async () => {
    const approval = vi.fn(() => 'approved' as const);

    await expect(
      runCodeMode({
        js: 'return await tools.sensitive({ value: 1 });',
        tools: {
          sensitive: tool({
            inputSchema: z.object({ value: z.number() }),
            needsApproval: async ({ value }) => value > 0,
            execute: async ({ value }) => ({ value }),
          }),
        },
        options: {
          approval: {
            onApprovalRequired: approval,
          },
        },
      }),
    ).resolves.toEqual({ value: 1 });

    expect(approval).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'sensitive',
        input: { value: 1 },
        toolCallId: expect.stringContaining(':tool-1'),
      }),
    );
  });

  it('does not call approval callback when needsApproval returns false', async () => {
    const approval = vi.fn(() => 'denied' as const);

    await expect(
      runCodeMode({
        js: 'return await tools.safe({ value: 0 });',
        tools: {
          safe: tool({
            inputSchema: z.object({ value: z.number() }),
            needsApproval: async ({ value }) => value > 0,
            execute: async ({ value }) => ({ value }),
          }),
        },
        options: {
          approval: {
            onApprovalRequired: approval,
          },
        },
      }),
    ).resolves.toEqual({ value: 0 });

    expect(approval).not.toHaveBeenCalled();
  });

  it('fails approval-required tools when callback denies', async () => {
    await expect(
      runCodeMode({
        js: 'return await tools.sensitive({});',
        tools: {
          sensitive: tool({
            inputSchema: z.object({}),
            needsApproval: true,
            execute: async () => 'should not run',
          }),
        },
        options: {
          approval: {
            onApprovalRequired: () => ({ approved: false, reason: 'no' }),
          },
        },
      }),
    ).rejects.toBeInstanceOf(CodeModeToolApprovalDeniedError);
  });

  it('fails approval-required tools when callback returns denied', async () => {
    const execute = vi.fn(async () => 'should not run');

    await expect(
      runCodeMode({
        js: 'return await tools.sensitive({});',
        tools: {
          sensitive: tool({
            inputSchema: z.object({}),
            needsApproval: true,
            execute,
          }),
        },
        options: {
          approval: {
            onApprovalRequired: () => 'denied',
          },
        },
      }),
    ).rejects.toBeInstanceOf(CodeModeToolApprovalDeniedError);
    expect(execute).not.toHaveBeenCalled();
  });

  it('sanitizes approval callback errors without executing the tool', async () => {
    const execute = vi.fn(async () => 'should not run');

    await expect(
      runCodeMode({
        js: 'return await tools.sensitive({});',
        tools: {
          sensitive: tool({
            inputSchema: z.object({}),
            needsApproval: true,
            execute,
          }),
        },
        options: {
          approval: {
            onApprovalRequired: () => {
              throw new Error('approval service unavailable');
            },
          },
        },
      }),
    ).rejects.toThrow('Host tool failed.');
    expect(execute).not.toHaveBeenCalled();
  });

  it('sanitizes needsApproval errors without executing the tool', async () => {
    const execute = vi.fn(async () => 'should not run');

    await expect(
      runCodeMode({
        js: 'return await tools.sensitive({});',
        tools: {
          sensitive: tool({
            inputSchema: z.object({}),
            needsApproval: () => {
              throw new Error('approval predicate exploded');
            },
            execute,
          }),
        },
      }),
    ).rejects.toThrow('Host tool failed.');
    expect(execute).not.toHaveBeenCalled();
  });
});
