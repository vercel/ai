import { describe, expect, it, vi } from 'vitest';
import {
  createRunner,
  getBindingContext,
  run,
  type RunContinuationState,
} from '../dist/index.js';

describe('continuation replay hardening', () => {
  it('preserves a long time/random trace across multiple interruption rounds', async () => {
    const traces: unknown[] = [];
    const source = `
      const trace = [];
      for (let i = 0; i < 64; i++) trace.push([Date.now(), Math.random()]);
      await tools.record(trace);
      const first = await tools.pause({ round: 1 });
      for (let i = 0; i < 64; i++) trace.push([Date.now(), Math.random()]);
      await tools.record(trace);
      const second = await tools.pause({ round: 2 });
      return { trace, first, second };
    `;
    const bindings = {
      tools: {
        record: (trace: unknown) => traces.push(trace),
        pause: () => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ kind: 'pause' });
          return context.resume?.resolution;
        },
      },
    };

    const first = await run({ source, bindings });
    if (first.status !== 'interrupted') throw new Error('Expected round one.');
    const second = await run({
      source,
      bindings,
      continuation: first.continuation,
      resolutions: [
        { interruptionId: first.interruptions[0]!.id, value: 'one' },
      ],
    });
    if (second.status !== 'interrupted') throw new Error('Expected round two.');
    const completed = await run({
      source,
      bindings,
      continuation: second.continuation,
      resolutions: [
        { interruptionId: second.interruptions[0]!.id, value: 'two' },
      ],
    });
    expect(completed).toMatchObject({
      status: 'completed',
      value: { first: 'one', second: 'two' },
    });
    expect(traces).toHaveLength(2);
    if (completed.status === 'completed') {
      expect((completed.value as { trace: unknown }).trace).toEqual(traces[1]);
      expect((traces[1] as unknown[]).slice(0, 64)).toEqual(traces[0]);
    }
  });

  it('keeps explicit Date behavior while replacing ambient time', async () => {
    const result = await run({
      source: `
        const explicit = new Date('2020-01-02T03:04:05.000Z');
        return {
          explicit: explicit.toISOString(),
          parsed: Date.parse('2020-01-02T03:04:05.000Z'),
          utc: Date.UTC(2020, 0, 2, 3, 4, 5),
          invalid: String(new Date('invalid')),
          constructor: explicit.constructor === Date,
          monotonic: Date.now() + 1 === Date.now(),
        };
      `,
    });
    expect(result).toEqual({
      status: 'completed',
      value: {
        explicit: '2020-01-02T03:04:05.000Z',
        parsed: 1_577_934_245_000,
        utc: 1_577_934_245_000,
        invalid: 'Invalid Date',
        constructor: true,
        monotonic: true,
      },
    });
  });

  it('rejects duplicate, unknown, missing, and extra resolutions before effects', async () => {
    const effect = vi.fn();
    const source = `
      return await Promise.all([tools.pause(1), tools.pause(2)]);
    `;
    const bindings = {
      tools: {
        pause: () => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ kind: 'pause' });
          effect(context.resume?.interruptionId);
          return context.resume?.resolution;
        },
      },
    };
    const interrupted = await run({ source, bindings });
    if (interrupted.status !== 'interrupted')
      throw new Error('Expected pause.');
    const [first, second] = interrupted.interruptions;

    for (const resolutions of [
      [],
      [{ interruptionId: first!.id, value: true }],
      [
        { interruptionId: first!.id, value: true },
        { interruptionId: first!.id, value: false },
      ],
      [
        { interruptionId: first!.id, value: true },
        { interruptionId: 'unknown', value: true },
      ],
      [
        { interruptionId: first!.id, value: true },
        { interruptionId: second!.id, value: true },
        { interruptionId: 'extra', value: true },
      ],
    ]) {
      await expect(
        run({
          source,
          bindings,
          continuation: interrupted.continuation,
          resolutions,
        }),
      ).rejects.toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });
    }
    expect(effect).not.toHaveBeenCalled();
  });

  it.each(['first', 'middle', 'last'] as const)(
    'detects replay divergence at the %s ledger entry',
    async position => {
      let saved: RunContinuationState | undefined;
      let mutate = false;
      const runner = createRunner({
        continuationCodec: {
          encode(state) {
            saved = structuredClone(state);
            return 'token';
          },
          decode() {
            if (!saved) throw new Error('missing state');
            const state = structuredClone(saved);
            if (mutate) {
              const index =
                position === 'first'
                  ? 0
                  : position === 'middle'
                    ? 1
                    : state.ledger.length - 1;
              state.ledger[index]!.inputJson = '"diverged"';
            }
            return state;
          },
        },
      });
      const source = `
        await tools.effect('first');
        await tools.effect('middle');
        return await tools.pause('last');
      `;
      const bindings = {
        tools: {
          effect: (input: unknown) => input,
          pause: () => {
            const context = getBindingContext();
            if (!context.resume) context.interrupt({ kind: 'pause' });
            return context.resume?.resolution;
          },
        },
      };
      const interrupted = await runner.run({ source, bindings });
      if (interrupted.status !== 'interrupted')
        throw new Error('Expected pause.');
      mutate = true;
      await expect(
        runner.run({
          source,
          bindings,
          continuation: interrupted.continuation,
          resolutions: [
            { interruptionId: interrupted.interruptions[0]!.id, value: true },
          ],
        }),
      ).rejects.toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });
    },
  );

  it('preserves caught rejection and Promise.race ordering across replay', async () => {
    const effects = vi.fn(async ({ id }: { id: string }) => {
      if (id === 'failure') throw new Error('expected failure');
      return id;
    });
    const source = `
      const failure = tools.effect({ id: 'failure' }).catch(error => error.message);
      const success = tools.effect({ id: 'success' });
      const race = await Promise.race([failure, success]);
      const all = await Promise.all([failure, success]);
      const resolution = await tools.pause();
      return { race, all, resolution };
    `;
    const bindings = {
      tools: {
        effect: effects,
        pause: () => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ kind: 'pause' });
          return context.resume?.resolution;
        },
      },
    };
    const interrupted = await run({ source, bindings });
    if (interrupted.status !== 'interrupted')
      throw new Error('Expected pause.');
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
      value: {
        race: 'Host binding failed.',
        all: ['Host binding failed.', 'success'],
        resolution: true,
      },
    });
    expect(effects).toHaveBeenCalledTimes(2);
  });

  it('replays a maximum-length completed ledger without duplicate effects', async () => {
    const effect = vi.fn((input: number) => input * 2);
    const count = 64;
    const source = `
      const values = [];
      for (let index = 0; index < ${count}; index++) {
        values.push(await tools.effect(index));
      }
      const resolution = await tools.pause();
      return { values, resolution };
    `;
    const bindings = {
      tools: {
        effect,
        pause: () => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ kind: 'pause' });
          return context.resume?.resolution;
        },
      },
    };
    const interrupted = await run({
      source,
      bindings,
      limits: { maxBridgeRequests: count + 1 },
    });
    if (interrupted.status !== 'interrupted')
      throw new Error('Expected pause.');
    await expect(
      run({
        source,
        bindings,
        continuation: interrupted.continuation,
        resolutions: [
          { interruptionId: interrupted.interruptions[0]!.id, value: 'done' },
        ],
        limits: { maxBridgeRequests: count + 1 },
      }),
    ).resolves.toMatchObject({
      status: 'completed',
      value: { resolution: 'done' },
    });
    expect(effect).toHaveBeenCalledTimes(count);
  });

  it('keeps a stable idempotency key when a signed continuation is retried', async () => {
    const interruptionIds: string[] = [];
    const source = 'return await tools.write();';
    const bindings = {
      tools: {
        write: () => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ kind: 'approval' });
          interruptionIds.push(context.resume!.interruptionId);
          return true;
        },
      },
    };
    const interrupted = await run({ source, bindings });
    if (interrupted.status !== 'interrupted')
      throw new Error('Expected pause.');
    const input = {
      source,
      bindings,
      continuation: interrupted.continuation,
      resolutions: [
        { interruptionId: interrupted.interruptions[0]!.id, value: true },
      ],
    };
    await run(input);
    await run(input);
    expect(interruptionIds).toEqual(['interrupt-1', 'interrupt-1']);
  });

  it('times out or reports custom codec encode failure and releases the slot', async () => {
    const hanging = createRunner({
      limits: { timeoutMs: 50 },
      continuationCodec: {
        encode: () => new Promise<never>(() => {}),
        decode: () => {
          throw new Error('not used');
        },
      },
    });
    await expect(
      hanging.run({
        source: 'return await tools.pause();',
        bindings: {
          tools: {
            pause: () => getBindingContext().interrupt({ kind: 'pause' }),
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'RUN_TIMEOUT' });
    await expect(run({ source: 'return 1;' })).resolves.toEqual({
      status: 'completed',
      value: 1,
    });

    const failing = createRunner({
      continuationCodec: {
        encode: () => {
          throw new Error('encode failed');
        },
        decode: () => {
          throw new Error('not used');
        },
      },
    });
    await expect(
      failing.run({
        source: 'return await tools.pause();',
        bindings: {
          tools: {
            pause: () => getBindingContext().interrupt({ kind: 'pause' }),
          },
        },
      }),
    ).rejects.toThrow('encode failed');
  });

  it('checks 100,000 generated traces against a replay effect model', () => {
    let randomState = 0x9e3779b9;
    for (let trace = 0; trace < 100_000; trace++) {
      const actions = Array.from({ length: 1 + (next() % 16) }, () =>
        next() % 5 === 0
          ? 'interrupted'
          : next() % 4 === 0
            ? 'rejected'
            : 'fulfilled',
      );
      const effects = Array.from({ length: actions.length }, () => 0);
      const ledger = new Set<number>();
      let pending: number | undefined;

      do {
        pending = undefined;
        for (const [index, action] of actions.entries()) {
          if (ledger.has(index)) continue;
          effects[index] = effects[index]! + 1;
          if (action === 'interrupted' && effects[index] === 1) {
            pending = index;
            break;
          }
          ledger.add(index);
        }
      } while (pending !== undefined);

      expect(ledger.size, `trace ${trace}`).toBe(actions.length);
      expect(effects, `trace ${trace}`).toEqual(
        actions.map(action => (action === 'interrupted' ? 2 : 1)),
      );
    }

    function next(): number {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      return randomState >>> 0;
    }
  });

  it('matches production replay to generated sequential effect traces', async () => {
    let randomState = 0xc0decafe;
    for (let trace = 0; trace < 16; trace++) {
      let interruptionCount = 0;
      const actions = Array.from(
        { length: 1 + (next() % 6) },
        (_value, index) => {
          let status: 'fulfilled' | 'rejected' | 'interrupted';
          if (interruptionCount < 2 && next() % 3 === 0) {
            status = 'interrupted';
            interruptionCount++;
          } else {
            status = next() % 4 === 0 ? 'rejected' : 'fulfilled';
          }
          return { index, status };
        },
      );
      const calls = Array.from({ length: actions.length }, () => 0);
      const source = `
        const output = [];
        for (const action of ${JSON.stringify(actions)}) {
          try { output.push(await tools.effect(action)); }
          catch { output.push('rejected'); }
        }
        return output;
      `;
      const bindings = {
        tools: {
          effect: (action: (typeof actions)[number]) => {
            const context = getBindingContext();
            calls[action.index]!++;
            if (action.status === 'rejected') throw new Error('expected');
            if (action.status === 'interrupted' && !context.resume) {
              context.interrupt({ index: action.index });
            }
            return action.index;
          },
        },
      };

      let result = await run({ source, bindings });
      while (result.status === 'interrupted') {
        result = await run({
          source,
          bindings,
          continuation: result.continuation,
          resolutions: result.interruptions.map(interruption => ({
            interruptionId: interruption.id,
            value: true,
          })),
        });
      }
      expect(result.value, `trace ${trace}`).toEqual(
        actions.map(action =>
          action.status === 'rejected' ? 'rejected' : action.index,
        ),
      );
      expect(calls, `trace ${trace}`).toEqual(
        actions.map(action => (action.status === 'interrupted' ? 2 : 1)),
      );
    }

    function next(): number {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      return randomState >>> 0;
    }
  });
});
