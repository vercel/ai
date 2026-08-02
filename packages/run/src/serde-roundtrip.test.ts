import { describe, expect, it, vi } from 'vitest';
import { getBindingContext, run } from '../dist/index.js';

describe('run-js-v1 serialization', () => {
  it('preserves rich final results and graph identity', async () => {
    const result = await run({
      source: `
        const shared = { value: 1 };
        const cycle = { label: 'cycle' };
        cycle.self = cycle;
        return {
          undefinedValue: undefined,
          specialNumbers: [NaN, Infinity, -Infinity, -0],
          bigint: 9007199254740993n,
          date: new Date(0),
          regexp: /run+/gi,
          map: new Map([['shared', shared]]),
          set: new Set([shared]),
          bytes: new Uint8Array([0, 127, 255]),
          view: new DataView(new Uint8Array([1, 2, 3]).buffer),
          sparse: [, 'value'],
          shared,
          alias: shared,
          cycle,
          error: new TypeError('invalid', { cause: shared }),
        };
      `,
    });

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const value = result.value as Record<string, any>;
    expect(Object.hasOwn(value, 'undefinedValue')).toBe(true);
    expect(value.undefinedValue).toBeUndefined();
    expect(Number.isNaN(value.specialNumbers[0])).toBe(true);
    expect(value.specialNumbers.slice(1, 3)).toEqual([Infinity, -Infinity]);
    expect(Object.is(value.specialNumbers[3], -0)).toBe(true);
    expect(value.bigint).toBe(9007199254740993n);
    expect(value.date).toEqual(new Date(0));
    expect(value.regexp).toEqual(/run+/gi);
    expect(value.bytes).toEqual(new Uint8Array([0, 127, 255]));
    expect(value.view).toBeInstanceOf(DataView);
    expect(value.view.getUint8(1)).toBe(2);
    expect(0 in value.sparse).toBe(false);
    expect(value.shared).toBe(value.alias);
    expect(value.map.get('shared')).toBe(value.shared);
    expect([...value.set]).toEqual([value.shared]);
    expect(value.cycle.self).toBe(value.cycle);
    expect(value.error).toBeInstanceOf(TypeError);
    expect(value.error).toMatchObject({
      name: 'TypeError',
      message: 'invalid',
    });
    expect(value.error.cause).toBe(value.shared);
    expect(value.error.stack).not.toContain('run.js');
  });

  it('uses the same rich codec in both binding directions', async () => {
    const execute = vi.fn((input: Record<string, any>) => {
      expect(input.self).toBe(input);
      expect(input.set).toBeInstanceOf(Set);
      expect(input.exact).toBe(42n);
      expect(input.error).toBeInstanceOf(RangeError);
      expect(input.error.cause).toBe(input);

      const shared = { origin: 'host' };
      const cycle: Record<string, unknown> = { shared };
      cycle.self = cycle;
      return {
        shared,
        alias: shared,
        cycle,
        map: new Map([['shared', shared]]),
        bytes: new Uint16Array([1, 65_535]),
      };
    });

    const result = await run({
      source: `
        const input = { set: new Set([1, 2]), exact: 42n };
        input.self = input;
        input.error = new RangeError('range', { cause: input });
        const output = await tools.exchange(input);
        return {
          identity: output.shared === output.alias &&
            output.map.get('shared') === output.shared &&
            output.cycle.self === output.cycle,
          output,
        };
      `,
      bindings: { tools: { exchange: execute } },
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const value = result.value as Record<string, any>;
    expect(value.identity).toBe(true);
    expect(value.output.shared).toBe(value.output.alias);
    expect(value.output.cycle.self).toBe(value.output.cycle);
    expect(value.output.map.get('shared')).toBe(value.output.shared);
    expect(value.output.bytes).toEqual(new Uint16Array([1, 65_535]));
  });

  it('preserves rich interruption payloads and resolutions through replay', async () => {
    const source = 'return await tools.pause();';
    const observed: unknown[] = [];
    const bindings = {
      tools: {
        pause: () => {
          const context = getBindingContext();
          const resume = context.resume;
          if (resume === undefined) {
            const shared = { kind: 'approval' };
            const payload: Record<string, unknown> = {
              shared,
              alias: shared,
              exact: 7n,
            };
            payload.self = payload;
            return context.interrupt(payload);
          }
          observed.push(resume.resolution);
          return resume.resolution;
        },
      },
    };

    const interrupted = await run({ source, bindings });
    expect(interrupted.status).toBe('interrupted');
    if (interrupted.status !== 'interrupted') return;
    const payload = interrupted.interruptions[0]!.payload as Record<
      string,
      any
    >;
    expect(payload.shared).toBe(payload.alias);
    expect(payload.self).toBe(payload);
    expect(payload.exact).toBe(7n);

    const resolution: Record<string, unknown> = {
      approved: new Set(['one', 'two']),
    };
    resolution.self = resolution;
    const completed = await run({
      source,
      bindings,
      continuation: interrupted.continuation,
      resolutions: [
        {
          interruptionId: interrupted.interruptions[0]!.id,
          value: resolution,
        },
      ],
    });
    expect(completed.status).toBe('completed');
    if (completed.status !== 'completed') return;
    const value = completed.value as Record<string, any>;
    expect(value.self).toBe(value);
    expect(value.approved).toEqual(new Set(['one', 'two']));
    const observedResolution = observed[0] as Record<string, any>;
    expect(observedResolution.self).toBe(observedResolution);
    expect(observedResolution.approved).toEqual(new Set(['one', 'two']));
  });

  it('reports the path of unsupported values', async () => {
    await expect(
      run({ source: 'return { nested: { callback() {} } };' }),
    ).rejects.toMatchObject({
      code: 'RUN_SERIALIZATION_ERROR',
      message: expect.stringMatching(/nested\.callback|function/u),
    });
  });
});
