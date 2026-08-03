import { describe, expect, it, vi } from 'vitest';
import {
  createRunner,
  createSignedContinuationCodec,
  getBindingContext,
  run,
  setMaxWorkers,
} from '../dist/index.js';

describe('run', () => {
  it('keeps concurrent worker realms and binding closures isolated', async () => {
    setMaxWorkers(4);
    const releases: Array<() => void> = [];
    let allStarted!: () => void;
    const started = new Promise<void>(resolve => {
      allStarted = resolve;
    });
    try {
      const executions = Array.from({ length: 4 }, (_, index) =>
        run<number>({
          source: `
            globalThis.marker = ${index};
            await tools.wait();
            return globalThis.marker;
          `,
          bindings: {
            tools: {
              wait: async () => {
                await new Promise<void>(resolve => {
                  releases.push(resolve);
                  if (releases.length === 4) allStarted();
                });
              },
            },
          },
        }),
      );
      await started;
      for (const release of releases) release();
      await expect(Promise.all(executions)).resolves.toEqual(
        Array.from({ length: 4 }, (_, value) => ({
          status: 'completed',
          value,
        })),
      );
    } finally {
      setMaxWorkers(undefined);
    }
  });

  it('executes JavaScript and returns a completed result', async () => {
    await expect(run({ source: 'return 2 + 3;' })).resolves.toEqual({
      status: 'completed',
      value: 5,
    });
  });

  it('exposes named binding groups as guest globals', async () => {
    const add = vi.fn(({ a, b }: { a: number; b: number }) => a + b);

    await expect(
      run({
        source: 'return await tools.add({ a: 2, b: 3 });',
        bindings: { tools: { add } },
      }),
    ).resolves.toEqual({ status: 'completed', value: 5 });
    expect(add).toHaveBeenCalledWith({ a: 2, b: 3 });
  });

  it('maps every guest argument to the host binding signature', async () => {
    const sum = vi.fn((...values: number[]) =>
      values.reduce((total, value) => total + value, 0),
    );

    await expect(
      run({
        source: 'return await tools.sum(1, 2, 3, 4);',
        bindings: { tools: { sum } },
      }),
    ).resolves.toEqual({ status: 'completed', value: 10 });
    expect(sum).toHaveBeenCalledWith(1, 2, 3, 4);
  });

  it('scopes binding context through async work and invalidates it after settlement', async () => {
    const requestIds = new Map<string, string>();
    const result = await run<string[]>({
      source: `
        return await Promise.all([
          tools.inspect('first'),
          tools.inspect('second'),
        ]);
      `,
      bindings: {
        tools: {
          inspect: async (label: string) => {
            const before = getBindingContext();
            await Promise.resolve();
            const after = getBindingContext();
            expect(after).toBe(before);
            requestIds.set(label, before.requestId);
            return `${label}:${before.requestId}`;
          },
        },
      },
    });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(new Set(result.value).size).toBe(2);
    }
    expect(requestIds.get('first')).not.toBe(requestIds.get('second'));
    expect(() => getBindingContext()).toThrow(
      'getBindingContext() can only be called while executing a run binding.',
    );
  });

  it('invalidates context in detached async work after binding settlement', async () => {
    let releaseDetached!: () => void;
    const detachedGate = new Promise<void>(resolve => {
      releaseDetached = resolve;
    });
    let reportDetached!: (value: unknown) => void;
    const detachedContext = new Promise<unknown>(resolve => {
      reportDetached = resolve;
    });

    await expect(
      run({
        source: 'return await tools.detach();',
        bindings: {
          tools: {
            detach: () => {
              void (async () => {
                await detachedGate;
                try {
                  reportDetached(getBindingContext());
                } catch (error) {
                  reportDetached(error);
                }
              })();
              return 'done';
            },
          },
        },
      }),
    ).resolves.toEqual({ status: 'completed', value: 'done' });
    releaseDetached();
    await expect(detachedContext).resolves.toMatchObject({
      message:
        'getBindingContext() can only be called while executing a run binding.',
    });
  });

  it('invalidates binding context when an invocation is aborted', async () => {
    const abortController = new AbortController();
    let started!: () => void;
    const bindingStarted = new Promise<void>(resolve => {
      started = resolve;
    });
    let releaseDetached!: () => void;
    const detachedGate = new Promise<void>(resolve => {
      releaseDetached = resolve;
    });
    let reportDetached!: (value: unknown) => void;
    const detachedContext = new Promise<unknown>(resolve => {
      reportDetached = resolve;
    });
    const execution = run({
      source: 'return await tools.wait();',
      abortSignal: abortController.signal,
      bindings: {
        tools: {
          wait: () => {
            void (async () => {
              await detachedGate;
              try {
                reportDetached(getBindingContext());
              } catch (error) {
                reportDetached(error);
              }
            })();
            started();
            return new Promise<never>(() => {});
          },
        },
      },
    });
    await bindingStarted;
    abortController.abort();
    await expect(execution).rejects.toMatchObject({ code: 'RUN_ABORTED' });
    releaseDetached();
    await expect(detachedContext).resolves.toMatchObject({
      message:
        'getBindingContext() can only be called while executing a run binding.',
    });
  });

  it('supports concurrent binding calls', async () => {
    const result = await run<number[]>({
      source: `
        return await Promise.all([
          functions.double(2),
          functions.double(3),
        ]);
      `,
      bindings: {
        functions: { double: (value: number) => value * 2 },
      },
    });

    if (result.status !== 'completed') {
      throw new Error('Expected completed result.');
    }
    expect(result.value).toEqual([4, 6]);
  });

  it('strips TypeScript syntax from function-body source', async () => {
    const result = await run<number>({
      source: 'const value: number = 42; return value;',
    });
    if (result.status !== 'completed') {
      throw new Error('Expected completed result.');
    }
    expect(result.value).toBe(42);
  });

  it('rejects unknown bindings', async () => {
    await expect(
      run({
        source: 'return await tools.missing();',
        bindings: { tools: {} },
      }),
    ).rejects.toMatchObject({ code: 'RUN_BINDING_ERROR' });
  });

  it('does not invoke inherited binding group properties', async () => {
    const inherited = vi.fn(() => 'should not run');
    const group = Object.assign(Object.create({ inherited }), {
      safe: () => 'safe',
    });

    await expect(
      run({
        source: 'return await tools.inherited({ attacker: true });',
        bindings: { tools: group },
      }),
    ).rejects.toMatchObject({ code: 'RUN_BINDING_ERROR' });
    expect(inherited).not.toHaveBeenCalled();
  });

  it.each(['constructor', 'hasOwnProperty', 'valueOf'])(
    'does not expose Object.prototype.%s as a binding',
    async name => {
      await expect(
        run({
          source: `return await tools.${name}({ attacker: true });`,
          bindings: { tools: { safe: () => 'safe' } },
        }),
      ).rejects.toMatchObject({ code: 'RUN_BINDING_ERROR' });
    },
  );

  it('rechecks that a binding is a function at invocation time', async () => {
    const group = {
      mutate: () => {
        (group as Record<string, unknown>).target = 'not a function';
      },
      target: () => 'should not run',
    };

    await expect(
      run({
        source: 'await tools.mutate(); return await tools.target();',
        bindings: { tools: group },
      }),
    ).rejects.toMatchObject({ code: 'RUN_BINDING_ERROR' });
  });

  it('rejects reserved guest namespaces', async () => {
    await expect(
      run({
        source: 'return 1;',
        bindings: { console: { log: () => undefined } },
      }),
    ).rejects.toThrow('Reserved binding namespace: console');
  });

  it('resumes an interrupted binding without repeating completed effects', async () => {
    const effect = vi.fn(() => 'created');
    const approve = vi.fn(() => {
      const context = getBindingContext();
      if (context.resume === undefined) {
        context.interrupt({ kind: 'approval', message: 'Allow it?' });
      }
      return context.resume?.resolution;
    });
    const input = {
      source: `
        const created = await tools.effect();
        const approved = await tools.approve();
        return { created, approved };
      `,
      bindings: { tools: { effect, approve } },
    };

    const interrupted = await run(input);
    expect(interrupted).toMatchObject({
      status: 'interrupted',
      interruptions: [
        {
          id: 'interrupt-2',
          arguments: [],
          bindingName: 'tools.approve',
          payload: { kind: 'approval', message: 'Allow it?' },
        },
      ],
    });
    if (interrupted.status !== 'interrupted') {
      throw new Error('Expected interruption.');
    }

    await expect(
      run({
        ...input,
        continuation: interrupted.continuation,
        resolutions: [
          { interruptionId: interrupted.interruptions[0]!.id, value: true },
        ],
      }),
    ).resolves.toEqual({
      status: 'completed',
      value: { created: 'created', approved: true },
    });
    expect(effect).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledTimes(2);
  });

  it('batches concurrent interruptions into one continuation', async () => {
    const approval = vi.fn((input: { name: string }) => {
      const context = getBindingContext();
      if (context.resume === undefined) {
        context.interrupt({ kind: 'approval', name: input.name });
      }
      return context.resume?.resolution;
    });
    const input = {
      source: `
        return await Promise.all([
          tools.approval({ name: 'first' }),
          tools.approval({ name: 'second' }),
        ]);
      `,
      bindings: { tools: { approval } },
    };

    const interrupted = await run(input);
    expect(interrupted.status).toBe('interrupted');
    if (interrupted.status !== 'interrupted') {
      throw new Error('Expected interruption.');
    }
    expect(interrupted.interruptions).toHaveLength(2);

    await expect(
      run({
        ...input,
        continuation: interrupted.continuation,
        resolutions: [
          {
            interruptionId: interrupted.interruptions[0]!.id,
            value: 'only one',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });

    await expect(
      run({
        ...input,
        continuation: interrupted.continuation,
        resolutions: interrupted.interruptions.map((item, index) => ({
          interruptionId: item.id,
          value: index === 0 ? 'yes' : 'also yes',
        })),
      }),
    ).resolves.toEqual({
      status: 'completed',
      value: ['yes', 'also yes'],
    });
  });

  it('rejects tampered signed continuations', async () => {
    const interrupted = await run({
      source: 'return await tools.pause();',
      bindings: {
        tools: {
          pause: () => getBindingContext().interrupt({ kind: 'pause' }),
        },
      },
    });
    if (interrupted.status !== 'interrupted') {
      throw new Error('Expected interruption.');
    }
    const token = interrupted.continuation as string;
    await expect(
      run({
        source: 'return await tools.pause();',
        bindings: { tools: { pause: () => undefined } },
        continuation: `${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`,
      }),
    ).rejects.toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });
  });

  it('replays Date and Math.random deterministically across bindings', async () => {
    const effectInputs: unknown[] = [];
    const source = `
      const before = { now: Date.now(), random: Math.random() };
      await tools.effect(before);
      const between = { now: Date.now(), random: Math.random() };
      const approved = await tools.approve(between);
      return {
        before,
        between,
        after: { now: Date.now(), random: Math.random() },
        approved,
      };
    `;
    const bindings = {
      tools: {
        effect: (input: unknown) => {
          effectInputs.push(input);
        },
        approve: () => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ kind: 'approval' });
          return context.resume?.resolution;
        },
      },
    };

    const interrupted = await run({ source, bindings });
    if (interrupted.status !== 'interrupted') {
      throw new Error('Expected interruption.');
    }
    const completed = await run({
      source,
      bindings,
      continuation: interrupted.continuation,
      resolutions: [
        { interruptionId: interrupted.interruptions[0]!.id, value: true },
      ],
    });
    expect(completed).toMatchObject({ status: 'completed' });
    expect(effectInputs).toHaveLength(1);
    if (completed.status === 'completed') {
      expect(completed.value).toMatchObject({
        before: effectInputs[0],
        approved: true,
      });
    }
  });

  it('supports sequential interruption rounds', async () => {
    const source = `
      const first = await tools.pause({ step: 1 });
      const second = await tools.pause({ step: 2 });
      return [first, second];
    `;
    const bindings = {
      tools: {
        pause: () => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ kind: 'approval' });
          return context.resume?.resolution;
        },
      },
    };
    const first = await run({ source, bindings });
    if (first.status !== 'interrupted')
      throw new Error('Expected first round.');
    const second = await run({
      source,
      bindings,
      continuation: first.continuation,
      resolutions: [{ interruptionId: first.interruptions[0]!.id, value: 'a' }],
    });
    if (second.status !== 'interrupted')
      throw new Error('Expected second round.');
    await expect(
      run({
        source,
        bindings,
        continuation: second.continuation,
        resolutions: [
          { interruptionId: second.interruptions[0]!.id, value: 'b' },
        ],
      }),
    ).resolves.toEqual({ status: 'completed', value: ['a', 'b'] });
  });

  it('replays rejected bindings without reinvoking them', async () => {
    const fail = vi.fn(() => {
      throw new Error('secret failure');
    });
    const source = `
      let failure;
      try { await tools.fail(); } catch (error) { failure = error.message; }
      const approved = await tools.approve();
      return { failure, approved };
    `;
    const bindings = {
      tools: {
        fail,
        approve: () => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ kind: 'approval' });
          return context.resume?.resolution;
        },
      },
    };
    const interrupted = await run({ source, bindings });
    if (interrupted.status !== 'interrupted')
      throw new Error('Expected interruption.');
    await run({
      source,
      bindings,
      continuation: interrupted.continuation,
      resolutions: [
        { interruptionId: interrupted.interruptions[0]!.id, value: true },
      ],
    });
    expect(fail).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed decoded state and times out hanging codecs', async () => {
    const malformedRunner = createRunner({
      continuationCodec: {
        encode: () => 'unused',
        decode: () => ({ version: 1 }) as never,
      },
    });
    await expect(
      malformedRunner.run({ source: 'return 1;', continuation: 'bad' }),
    ).rejects.toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });

    const hangingRunner = createRunner({
      limits: { timeoutMs: 20 },
      continuationCodec: {
        encode: () => 'unused',
        decode: () => new Promise<never>(() => {}),
      },
    });
    await expect(
      hangingRunner.run({ source: 'return 1;', continuation: 'pending' }),
    ).rejects.toMatchObject({ code: 'RUN_TIMEOUT' });
  });

  it('aborts a hanging continuation decode', async () => {
    let codecSignal: AbortSignal | undefined;
    const runner = createRunner({
      limits: { timeoutMs: 1_000 },
      continuationCodec: {
        encode: () => 'unused',
        decode: (_token, context) => {
          codecSignal = context?.abortSignal;
          return new Promise<never>(() => {});
        },
      },
    });
    const abortController = new AbortController();
    const result = runner.run({
      source: 'return 1;',
      continuation: 'pending',
      abortSignal: abortController.signal,
    });
    abortController.abort();
    await expect(result).rejects.toMatchObject({ code: 'RUN_ABORTED' });
    expect(codecSignal?.aborted).toBe(true);
  });

  it('enforces aggregate continuation limits', async () => {
    await expect(
      run({
        source: 'return await tools.pause("large-input");',
        bindings: {
          tools: {
            pause: () =>
              getBindingContext().interrupt({
                kind: 'approval',
                detail: 'x'.repeat(200),
              }),
          },
        },
        limits: { maxContinuationBytes: 128 },
      }),
    ).rejects.toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });
  });

  it('batches a larger concurrent interruption set at the worker barrier', async () => {
    const source = `
      return await Promise.all(
        Array.from({ length: 16 }, (_value, index) => tools.pause(index))
      );
    `;
    const bindings = {
      tools: {
        pause: () => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ kind: 'approval' });
          return context.resume?.resolution;
        },
      },
    };
    const interrupted = await run({ source, bindings });
    if (interrupted.status !== 'interrupted')
      throw new Error('Expected interruption.');
    expect(interrupted.interruptions).toHaveLength(16);
    await expect(
      run({
        source,
        bindings,
        continuation: interrupted.continuation,
        resolutions: interrupted.interruptions.map((item, index) => ({
          interruptionId: item.id,
          value: index,
        })),
      }),
    ).resolves.toEqual({
      status: 'completed',
      value: Array.from({ length: 16 }, (_value, index) => index),
    });
  });

  it('preserves concurrent binding settlement order during replay', async () => {
    const delayed = vi.fn(
      async ({ id, delay }: { id: string; delay: number }) =>
        await new Promise<string>(resolve =>
          setTimeout(() => resolve(id), delay),
        ),
    );
    const source = `
      const slow = tools.delayed({ id: 'slow', delay: 20 });
      const fast = tools.delayed({ id: 'fast', delay: 0 });
      const winner = await Promise.race([slow, fast]);
      const all = await Promise.all([slow, fast]);
      const approved = await tools.pause();
      return { winner, all, approved };
    `;
    const bindings = {
      tools: {
        delayed,
        pause: () => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ kind: 'approval' });
          return context.resume?.resolution;
        },
      },
    };
    const interrupted = await run({ source, bindings });
    if (interrupted.status !== 'interrupted')
      throw new Error('Expected interruption.');
    await expect(
      run({
        source,
        bindings,
        continuation: interrupted.continuation,
        resolutions: [
          { interruptionId: interrupted.interruptions[0]!.id, value: true },
        ],
      }),
    ).resolves.toEqual({
      status: 'completed',
      value: { winner: 'fast', all: ['slow', 'fast'], approved: true },
    });
    expect(delayed).toHaveBeenCalledTimes(2);
  });

  it('returns an observed interruption after the worker is already ready', async () => {
    const signed = createSignedContinuationCodec({ secret: 's'.repeat(32) });
    const runner = createRunner({
      continuationCodec: {
        async encode(state, context) {
          await new Promise(resolve => setTimeout(resolve, 20));
          return signed.encode(state, context);
        },
        decode: signed.decode,
      },
    });

    await expect(
      runner.run({
        source: `
          return await Promise.race([
            tools.pause(),
            Promise.resolve('fast'),
          ]);
        `,
        bindings: {
          tools: {
            pause: () => getBindingContext().interrupt({ kind: 'pause' }),
          },
        },
      }),
    ).resolves.toMatchObject({ status: 'interrupted' });
  });

  it('binds continuations to audience, caller context, and binding manifest', async () => {
    const codec = createSignedContinuationCodec({ secret: 'x'.repeat(32) });
    const source = 'return await tools.pause();';
    const bindings = {
      tools: {
        pause: () => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ kind: 'pause' });
          return context.resume!.resolution;
        },
      },
    };
    const runner = createRunner({
      continuationCodec: codec,
      continuationAudience: 'endpoint-a',
    });
    const first = await runner.run({
      source,
      bindings,
      continuationContext: { tenantId: 'tenant-a' },
    });
    if (first.status !== 'interrupted')
      throw new Error('Expected interruption.');
    const resume = {
      source,
      bindings,
      continuation: first.continuation,
      resolutions: [
        { interruptionId: first.interruptions[0]!.id, value: true },
      ],
    };

    await expect(
      createRunner({
        continuationCodec: codec,
        continuationAudience: 'endpoint-b',
      }).run({
        ...resume,
        continuationContext: { tenantId: 'tenant-a' },
      }),
    ).rejects.toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });
    await expect(
      runner.run({
        ...resume,
        continuationContext: { tenantId: 'tenant-b' },
      }),
    ).rejects.toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });
    await expect(
      runner.run({
        ...resume,
        bindings: { tools: { ...bindings.tools, extra: () => true } },
        continuationContext: { tenantId: 'tenant-a' },
      }),
    ).rejects.toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });
  });

  it('rejects non-exact resolution envelopes', async () => {
    const source = 'return await tools.pause();';
    const bindings = {
      tools: {
        pause: () => getBindingContext().interrupt({ kind: 'pause' }),
      },
    };
    const first = await run({ source, bindings });
    if (first.status !== 'interrupted')
      throw new Error('Expected interruption.');
    await expect(
      run({
        source,
        bindings,
        continuation: first.continuation,
        resolutions: [
          {
            interruptionId: first.interruptions[0]!.id,
            value: true,
            extra: true,
          } as never,
        ],
      }),
    ).rejects.toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });
  });

  it('requires signing configuration only when a continuation is used', async () => {
    const previous = process.env.RUN_CONTINUATION_SECRET;
    delete process.env.RUN_CONTINUATION_SECRET;
    const runner = createRunner();
    if (previous !== undefined) process.env.RUN_CONTINUATION_SECRET = previous;

    await expect(runner.run({ source: 'return 1;' })).resolves.toEqual({
      status: 'completed',
      value: 1,
    });
    await expect(
      runner.run({
        source: 'return await tools.pause();',
        bindings: {
          tools: {
            pause: () => getBindingContext().interrupt({ kind: 'pause' }),
          },
        },
      }),
    ).rejects.toThrow('Continuation signing is not configured');
  });

  it('resumes across runners that share a continuation secret', async () => {
    const firstRunner = createRunner({ continuationSecret: 'a'.repeat(32) });
    const secondRunner = createRunner({ continuationSecret: 'a'.repeat(32) });
    const input = {
      source: 'return await tools.pause();',
      bindings: {
        tools: {
          pause: () => {
            const context = getBindingContext();
            if (!context.resume) context.interrupt({ kind: 'pause' });
            return context.resume!.resolution;
          },
        },
      },
    };
    const interrupted = await firstRunner.run(input);
    if (interrupted.status !== 'interrupted') {
      throw new Error('Expected interruption.');
    }
    await expect(
      secondRunner.run({
        ...input,
        continuation: interrupted.continuation,
        resolutions: [
          {
            interruptionId: interrupted.interruptions[0]!.id,
            value: 'approved',
          },
        ],
      }),
    ).resolves.toEqual({ status: 'completed', value: 'approved' });
  });

  it('uses RUN_CONTINUATION_SECRET across independently created runners', async () => {
    const firstRunner = createRunner();
    const secondRunner = createRunner();
    const source = 'return await tools.pause("environment");';
    const bindings = {
      tools: {
        pause: (label: string) => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ label });
          return context.resume!.resolution;
        },
      },
    };
    const interrupted = await firstRunner.run({ source, bindings });
    if (interrupted.status !== 'interrupted') {
      throw new Error('Expected interruption.');
    }
    expect(interrupted.interruptions[0]!.arguments).toEqual(['environment']);
    await expect(
      secondRunner.run({
        source,
        bindings,
        continuation: interrupted.continuation,
        resolutions: [
          {
            interruptionId: interrupted.interruptions[0]!.id,
            value: 'resumed',
          },
        ],
      }),
    ).resolves.toEqual({ status: 'completed', value: 'resumed' });
  });

  it('rejects conflicting continuation signing options', () => {
    expect(() =>
      createRunner({
        continuationSecret: 'a'.repeat(32),
        continuationCodec: createSignedContinuationCodec({
          secret: 'b'.repeat(32),
        }),
      }),
    ).toThrow('cannot be used together');
  });
});
