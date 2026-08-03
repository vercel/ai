import { tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import {
  CodeModeToolApprovalRequiredError,
  experimental_runCodeMode as runCodeMode,
} from '../dist/index.js';

describe('exceptions and serialization', () => {
  it('fails clearly for unknown tools', async () => {
    await expect(
      runCodeMode({
        js: 'return await tools.nope({});',
        tools: {},
      }),
    ).rejects.toThrow(/Unknown tool: nope/);
  });

  it('fails clearly for tools without execute', async () => {
    await expect(
      runCodeMode({
        js: 'return await tools.manual({});',
        tools: {
          manual: tool({
            inputSchema: z.object({}),
          }),
        },
      }),
    ).rejects.toThrow(/does not have execute/);
  });

  it('validates tool input before execute', async () => {
    const execute = vi.fn(async () => ({ sum: 0 }));

    await expect(
      runCodeMode({
        js: "return await tools.add({ a: 'wrong', b: 2 });",
        tools: {
          add: tool({
            inputSchema: z.object({ a: z.number(), b: z.number() }),
            execute,
          }),
        },
      }),
    ).rejects.toThrow(/Invalid input/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not execute tools that require approval', async () => {
    const execute = vi.fn(async () => ({ ok: true }));

    await expect(
      runCodeMode({
        js: 'return await tools.guarded({});',
        tools: {
          guarded: tool({
            inputSchema: z.object({}),
            needsApproval: true,
            execute,
          }),
        },
      }),
    ).rejects.toBeInstanceOf(CodeModeToolApprovalRequiredError);
    expect(execute).not.toHaveBeenCalled();
  });

  it('sanitizes tool throws', async () => {
    await expect(
      runCodeMode({
        js: 'return await tools.fail({});',
        tools: {
          fail: tool({
            inputSchema: z.object({}),
            execute: async (): Promise<unknown> => {
              throw new Error('tool exploded');
            },
          }),
        },
      }),
    ).rejects.toThrow('Host tool failed.');
  });

  it('propagates syntax errors from the sandbox', async () => {
    await expect(
      runCodeMode({
        js: 'return ; }',
        tools: {},
      }),
    ).rejects.toThrow(/syntax|unexpected|expression expected/i);
  });

  it('propagates runtime exceptions from the sandbox', async () => {
    await expect(
      runCodeMode({
        js: "throw new Error('sandbox exploded');",
        tools: {},
      }),
    ).rejects.toThrow(/sandbox exploded/);
  });

  it('rejects non-JSON-serializable results', async () => {
    await expect(
      runCodeMode({
        js: 'return 1n;',
        tools: {},
      }),
    ).rejects.toThrow(/JSON-serializable|bigint/i);
  });

  it('uses JSON.stringify semantics for non-finite numeric results', async () => {
    await expect(
      runCodeMode({
        js: 'return { value: Infinity };',
        tools: {},
      }),
    ).resolves.toEqual({ value: null });
  });

  it('uses JSON.stringify semantics for function values in returned objects', async () => {
    await expect(
      runCodeMode({
        js: 'return { value: () => 1 };',
        tools: {},
      }),
    ).resolves.toEqual({});
  });

  it('rejects circular tool inputs before execute', async () => {
    const execute = vi.fn(async () => 'should not run');

    await expect(
      runCodeMode({
        js: `
          const input = { value: "x" };
          input.self = input;
          return await tools.echo(input);
        `,
        tools: {
          echo: tool({
            inputSchema: z.object({ value: z.string() }),
            execute,
          }),
        },
      }),
    ).rejects.toThrow(/circular|JSON/i);
    expect(execute).not.toHaveBeenCalled();
  });

  it('enforces max result size', async () => {
    await expect(
      runCodeMode({
        js: "return 'abcdef';",
        tools: {},
        options: { executionPolicy: { maxResultBytes: 4 } },
      }),
    ).rejects.toThrow(/size limit/);
  });

  it('enforces max tool input size before execute', async () => {
    const execute = vi.fn(async () => 'should not run');

    await expect(
      runCodeMode({
        js: "return await tools.echo({ value: 'abcdef' });",
        tools: {
          echo: tool({
            inputSchema: z.object({ value: z.string() }),
            execute,
          }),
        },
        options: { executionPolicy: { maxToolInputBytes: 4 } },
      }),
    ).rejects.toThrow(/size limit/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('enforces max tool output size', async () => {
    await expect(
      runCodeMode({
        js: 'return await tools.large({});',
        tools: {
          large: tool({
            inputSchema: z.object({}),
            execute: async () => ({ value: 'abcdef' }),
          }),
        },
        options: { executionPolicy: { maxToolOutputBytes: 4 } },
      }),
    ).rejects.toThrow(/size limit/);
  });

  it('rejects circular tool outputs', async () => {
    const output: { value: string; self?: unknown } = { value: 'x' };
    output.self = output;

    await expect(
      runCodeMode({
        js: 'return await tools.circular({});',
        tools: {
          circular: tool({
            inputSchema: z.object({}),
            execute: async () => output,
          }),
        },
      }),
    ).rejects.toThrow(/circular|closes the circle/);
  });

  it('uses JSON.stringify semantics for host tool outputs', async () => {
    await expect(
      runCodeMode({
        js: 'return await tools.date({});',
        tools: {
          date: tool({
            inputSchema: z.object({}),
            execute: async () => new Date(0),
          }),
        },
      }),
    ).resolves.toBe('1970-01-01T00:00:00.000Z');
  });

  it('omits undefined object properties from host tool outputs', async () => {
    await expect(
      runCodeMode({
        js: 'return await tools.catalog({});',
        tools: {
          catalog: tool({
            inputSchema: z.object({}),
            execute: async () => ({
              concepts: [
                { name: 'first', recommendedNextAction: 'open' },
                { name: 'second', recommendedNextAction: undefined },
              ],
            }),
          }),
        },
      }),
    ).resolves.toEqual({
      concepts: [
        { name: 'first', recommendedNextAction: 'open' },
        { name: 'second' },
      ],
    });
  });
});
