import { tool } from 'ai';
import { createSignedContinuationCodec } from 'run';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import {
  experimental_runCodeMode as runCodeMode,
  type CodeModeToolExecutionOptions,
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

  it('does not treat inherited Object.prototype members as tools', async () => {
    await expect(
      runCodeMode({
        js: 'return await tools.constructor({});',
        tools: {},
      }),
    ).rejects.toThrow(/Unknown tool: constructor/);
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

  it('interrupts and resumes tools that require approval', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const tools = {
      guarded: tool({
        inputSchema: z.object({}),
        needsApproval: true,
        execute,
      }),
    };

    const interrupted = await runCodeMode({
      js: 'return await tools.guarded({});',
      tools,
    });
    expect(interrupted).toMatchObject({
      status: 'interrupted',
      interruptions: [
        { bindingName: 'tools.guarded', payload: { kind: 'tool-approval' } },
      ],
    });
    expect(execute).not.toHaveBeenCalled();

    const pending = interrupted as {
      continuation: unknown;
      interruptions: Array<{ id: string }>;
    };
    await expect(
      runCodeMode({
        js: 'return await tools.guarded({});',
        tools,
        continuation: pending.continuation,
        resolutions: [
          { interruptionId: pending.interruptions[0]!.id, value: true },
        ],
      }),
    ).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('denies approval without executing the protected tool', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const tools = {
      guarded: tool({
        inputSchema: z.object({}),
        needsApproval: true,
        execute,
      }),
    };
    const interrupted = await runCodeMode({
      js: 'return await tools.guarded({});',
      tools,
    });
    const pending = interrupted as {
      continuation: unknown;
      interruptions: Array<{ id: string }>;
    };
    await expect(
      runCodeMode({
        js: 'return await tools.guarded({});',
        tools,
        continuation: pending.continuation,
        resolutions: [
          { interruptionId: pending.interruptions[0]!.id, value: false },
        ],
      }),
    ).rejects.toThrow('approval was denied');
    expect(execute).not.toHaveBeenCalled();
  });

  it('preserves completed approval across a later auth interruption', async () => {
    const needsApproval = vi.fn(() => true);
    const execute = vi.fn(async (_input, options) => {
      const extended = options as CodeModeToolExecutionOptions;
      if (extended.resume === undefined) {
        extended.interrupt!({ kind: 'oauth', provider: 'example' });
      }
      return { token: extended.resume?.resolution };
    });
    const tools = {
      guarded: tool({
        inputSchema: z.object({}),
        needsApproval,
        execute,
      }),
    };
    const js = 'return await tools.guarded({});';

    const approval = await runCodeMode({ js, tools });
    const first = approval as {
      continuation: unknown;
      interruptions: Array<{ id: string }>;
    };
    const auth = await runCodeMode({
      js,
      tools,
      continuation: first.continuation,
      resolutions: [
        { interruptionId: first.interruptions[0]!.id, value: true },
      ],
    });
    expect(auth).toMatchObject({
      status: 'interrupted',
      interruptions: [{ payload: { kind: 'oauth', provider: 'example' } }],
    });
    const second = auth as {
      continuation: unknown;
      interruptions: Array<{ id: string }>;
    };
    await expect(
      runCodeMode({
        js,
        tools,
        continuation: second.continuation,
        resolutions: [
          { interruptionId: second.interruptions[0]!.id, value: 'credential' },
        ],
      }),
    ).resolves.toEqual({ token: 'credential' });
    expect(needsApproval).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('preserves approval across multiple authentication rounds', async () => {
    const needsApproval = vi.fn(() => true);
    const execute = vi.fn(async (_input, options) => {
      const extended = options as CodeModeToolExecutionOptions;
      if (extended.resume === undefined) {
        extended.interrupt!({ kind: 'oauth', step: 1 });
      }
      if (
        (extended.resume?.payload as { step?: unknown } | undefined)?.step === 1
      ) {
        extended.interrupt!({ kind: 'oauth', step: 2 });
      }
      return { credential: extended.resume?.resolution };
    });
    const tools = {
      guarded: tool({
        inputSchema: z.object({}),
        needsApproval,
        execute,
      }),
    };
    const js = 'return await tools.guarded({});';

    const approval = asInterrupted(await runCodeMode({ js, tools }));
    const authOne = asInterrupted(
      await runCodeMode({
        js,
        tools,
        continuation: approval.continuation,
        resolutions: [
          { interruptionId: approval.interruptions[0]!.id, value: true },
        ],
      }),
    );
    expect(authOne.interruptions[0]!.payload).toEqual({
      kind: 'oauth',
      step: 1,
    });
    const authTwo = asInterrupted(
      await runCodeMode({
        js,
        tools,
        continuation: authOne.continuation,
        resolutions: [
          { interruptionId: authOne.interruptions[0]!.id, value: 'first' },
        ],
      }),
    );
    expect(authTwo.interruptions[0]!.payload).toEqual({
      kind: 'oauth',
      step: 2,
    });
    await expect(
      runCodeMode({
        js,
        tools,
        continuation: authTwo.continuation,
        resolutions: [
          { interruptionId: authTwo.interruptions[0]!.id, value: 'second' },
        ],
      }),
    ).resolves.toEqual({ credential: 'second' });
    expect(needsApproval).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(JSON.stringify([authOne, authTwo])).not.toContain(
      'code-mode-host-interrupt',
    );
  });

  it('batches concurrent approvals and requires the exact complete batch', async () => {
    const execute = vi.fn(async ({ id }: { id: string }) => id);
    const tools = {
      guarded: tool({
        inputSchema: z.object({ id: z.string() }),
        needsApproval: true,
        execute,
      }),
    };
    const js = `
      return await Promise.all([
        tools.guarded({ id: 'a' }),
        tools.guarded({ id: 'b' })
      ]);
    `;
    const interrupted = asInterrupted(await runCodeMode({ js, tools }));
    expect(interrupted.interruptions).toHaveLength(2);
    await expect(
      runCodeMode({
        js,
        tools,
        continuation: interrupted.continuation,
        resolutions: [
          { interruptionId: interrupted.interruptions[0]!.id, value: true },
        ],
      }),
    ).rejects.toMatchObject({ code: 'CODE_MODE_PROTOCOL_ERROR' });
    expect(execute).not.toHaveBeenCalled();

    await expect(
      runCodeMode({
        js,
        tools,
        continuation: interrupted.continuation,
        resolutions: interrupted.interruptions.map(interruption => ({
          interruptionId: interruption.id,
          value: true,
        })),
      }),
    ).resolves.toEqual(['a', 'b']);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('resumes across codec instances with the same durable signing key', async () => {
    const secret = 'durable-code-mode-secret-value!!';
    const tools = {
      guarded: tool({
        inputSchema: z.object({}),
        needsApproval: true,
        execute: async () => 'complete',
      }),
    };
    const js = 'return await tools.guarded({});';
    const firstCodec = createSignedContinuationCodec({ secret });
    const interrupted = asInterrupted(
      await runCodeMode({
        js,
        tools,
        options: { continuationCodec: firstCodec },
      }),
    );
    const secondCodec = createSignedContinuationCodec({ secret });
    await expect(
      runCodeMode({
        js,
        tools,
        options: { continuationCodec: secondCodec },
        continuation: interrupted.continuation,
        resolutions: [
          { interruptionId: interrupted.interruptions[0]!.id, value: true },
        ],
      }),
    ).resolves.toBe('complete');
  });

  it('binds continuations to caller context and the tool manifest', async () => {
    const secret = 'scoped-code-mode-secret-value!!!';
    const codec = createSignedContinuationCodec({ secret });
    const tools = {
      guarded: tool({
        inputSchema: z.object({}),
        needsApproval: true,
        execute: async () => 'complete',
      }),
    };
    const js = 'return await tools.guarded({});';
    const interrupted = asInterrupted(
      await runCodeMode({
        js,
        tools,
        options: { continuationCodec: codec },
        continuationContext: { tenantId: 'tenant-a' },
      }),
    );
    const resume = {
      js,
      options: { continuationCodec: codec },
      continuation: interrupted.continuation,
      resolutions: [
        { interruptionId: interrupted.interruptions[0]!.id, value: true },
      ],
    };

    await expect(
      runCodeMode({
        ...resume,
        tools,
        continuationContext: { tenantId: 'tenant-b' },
      }),
    ).rejects.toMatchObject({ code: 'CODE_MODE_PROTOCOL_ERROR' });
    await expect(
      runCodeMode({
        ...resume,
        tools: { ...tools, extra: tool({ inputSchema: z.object({}) }) },
        continuationContext: { tenantId: 'tenant-a' },
      }),
    ).rejects.toMatchObject({ code: 'CODE_MODE_PROTOCOL_ERROR' });
  });

  it('uses unique logical tool IDs that remain stable across replay', async () => {
    const observedIds: string[] = [];
    const tools = {
      authenticate: tool({
        inputSchema: z.object({}),
        execute: async (_input, options) => {
          const extended = options as CodeModeToolExecutionOptions;
          observedIds.push(extended.toolCallId);
          if (!extended.resume) extended.interrupt!({ kind: 'authenticate' });
          return extended.toolCallId;
        },
      }),
    };
    const js = 'return await tools.authenticate({});';
    const first = asInterrupted(await runCodeMode({ js, tools }));
    const firstValue = await runCodeMode({
      js,
      tools,
      continuation: first.continuation,
      resolutions: [
        { interruptionId: first.interruptions[0]!.id, value: true },
      ],
    });
    const second = asInterrupted(await runCodeMode({ js, tools }));

    expect(observedIds[0]).toBe(observedIds[1]);
    expect(firstValue).toBe(observedIds[0]);
    expect(observedIds[2]).not.toBe(observedIds[0]);
    expect(second.interruptions).toHaveLength(1);
  });

  it('keeps application payloads that resemble internal envelopes nested', async () => {
    const collidingPayload = {
      kind: 'code-mode-interrupt-v1',
      stage: 'host',
      approvalChecked: true,
      toolName: 'other',
      toolCallId: 'other',
      payload: 'application-value',
    };
    const tools = {
      pause: tool({
        inputSchema: z.object({}),
        execute: async (_input, options) => {
          (options as CodeModeToolExecutionOptions).interrupt!(
            collidingPayload,
          );
        },
      }),
    };
    const interrupted = asInterrupted(
      await runCodeMode({ js: 'return await tools.pause({});', tools }),
    );
    expect(interrupted.interruptions[0]!.payload).toEqual(collidingPayload);
  });

  it('sanitizes tool throws', async () => {
    const failure = expect(
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
    ).rejects;
    await failure.toThrow('Host tool failed.');
    await failure.toMatchObject({ code: 'CODE_MODE_HOST_TOOL_ERROR' });
  });

  it('propagates syntax errors from the sandbox', async () => {
    const failure = runCodeMode({
      js: `const valid = 1;
const invalid = ;
return valid;`,
      tools: {},
    });
    await expect(failure).rejects.toThrow(
      /syntax|unexpected|expression expected/i,
    );
    await expect(failure).rejects.toMatchObject({
      stack: expect.stringContaining('run.js:2:'),
    });
  });

  it('propagates runtime exceptions from the sandbox', async () => {
    const failure = runCodeMode({
      js: `const ready = true;
if (ready) {
  throw new Error('sandbox exploded');
}`,
      tools: {},
    });
    await expect(failure).rejects.toThrow(/sandbox exploded/);
    await expect(failure).rejects.toMatchObject({
      stack: expect.stringMatching(
        /^CodeModeError: sandbox exploded\n.*run\.js:3:/su,
      ),
    });
  });

  it('preserves bigint results', async () => {
    await expect(
      runCodeMode({
        js: 'return 1n;',
        tools: {},
      }),
    ).resolves.toBe(1n);
  });

  it('preserves non-finite numeric results', async () => {
    await expect(
      runCodeMode({
        js: 'return { value: Infinity };',
        tools: {},
      }),
    ).resolves.toEqual({ value: Infinity });
  });

  it('preserves rich result graphs and repeated references', async () => {
    const result = (await runCodeMode({
      js: `
        const shared = { value: 1 };
        const cycle = { shared };
        cycle.self = cycle;
        return {
          shared,
          alias: shared,
          cycle,
          map: new Map([['shared', shared]]),
          set: new Set([shared]),
          bytes: new Uint8Array([1, 2, 3]),
        };
      `,
      tools: {},
    })) as {
      shared: unknown;
      alias: unknown;
      cycle: { self?: unknown };
      map: Map<string, unknown>;
      set: Set<unknown>;
      bytes: Uint8Array;
    };
    expect(result.alias).toBe(result.shared);
    expect(result.cycle.self).toBe(result.cycle);
    expect(result.map.get('shared')).toBe(result.shared);
    expect([...result.set]).toEqual([result.shared]);
    expect(result.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('rejects function values in returned objects', async () => {
    await expect(
      runCodeMode({
        js: 'return { value: () => 1 };',
        tools: {},
      }),
    ).rejects.toThrow(/serializable|function/i);
  });

  it('preserves circular tool inputs', async () => {
    const execute = vi.fn(async (input: unknown) => {
      const value = input as { self?: unknown };
      return value.self === value;
    });

    await expect(
      runCodeMode({
        js: `
          const input = { value: "x" };
          input.self = input;
          return await tools.echo(input);
        `,
        tools: {
          echo: tool({
            inputSchema: z.unknown(),
            execute,
          }),
        },
      }),
    ).resolves.toBe(true);
    expect(execute).toHaveBeenCalledOnce();
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

  it('preserves circular tool outputs', async () => {
    const output: { value: string; self?: unknown } = { value: 'x' };
    output.self = output;

    const result = (await runCodeMode({
      js: 'return await tools.circular({});',
      tools: {
        circular: tool({
          inputSchema: z.object({}),
          execute: async () => output,
        }),
      },
    })) as typeof output;
    expect(result.self).toBe(result);
  });

  it('preserves Date host tool outputs', async () => {
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
    ).resolves.toEqual(new Date(0));
  });

  it('preserves undefined object properties from host tool outputs', async () => {
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
        { name: 'second', recommendedNextAction: undefined },
      ],
    });
  });
});

function asInterrupted(value: unknown): {
  continuation: unknown;
  interruptions: Array<{ id: string; payload: unknown }>;
} {
  if (
    typeof value !== 'object' ||
    value === null ||
    (value as { status?: unknown }).status !== 'interrupted' ||
    !Array.isArray((value as { interruptions?: unknown }).interruptions) ||
    !('continuation' in value)
  ) {
    throw new Error('Expected interrupted code-mode result.');
  }
  return value as {
    continuation: unknown;
    interruptions: Array<{ id: string; payload: unknown }>;
  };
}
