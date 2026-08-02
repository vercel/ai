import { describe, expect, it, vi } from 'vitest';
import {
  RunBindingError,
  createRunner,
  getBindingContext,
  run,
  type BindingContext,
  type RunContinuationState,
} from '../dist/index.js';
import { invokeHostBinding } from '../dist/binding-invocation.js';
import { serializeError } from './errors.js';
import { serializeRunValue } from './utils/serde.js';

const NON_SERIALIZABLE_OUTPUTS: Array<[string, () => unknown]> = [
  ['function output', (): unknown => () => undefined],
  ['symbol output', (): unknown => Symbol('value')],
  ['class instance output', (): unknown => new (class Value {})()],
];

describe('serialization boundaries', () => {
  it.each(['ascii', 'é', '🧪', '\ud800'])(
    'measures binding arguments as UTF-8 bytes: %s',
    async text => {
      const inputJson = serializeRunValue([text]);
      const exactBytes = Buffer.byteLength(inputJson);
      const binding = vi.fn((input: unknown) => input);

      await expect(
        invokeHostBinding({
          bindingName: 'tools.echo',
          inputJson,
          bindings: { tools: { echo: binding } },
          context: bindingContext(),
          maxBindingInputBytes: exactBytes,
          maxBindingOutputBytes: 1024,
        }),
      ).resolves.toMatchObject({ status: 'fulfilled' });

      await expect(
        invokeHostBinding({
          bindingName: 'tools.echo',
          inputJson,
          bindings: { tools: { echo: binding } },
          context: bindingContext(),
          maxBindingInputBytes: exactBytes - 1,
          maxBindingOutputBytes: 1024,
        }),
      ).rejects.toBeInstanceOf(RunBindingError);
    },
  );

  it.each(['ascii', 'é', '🧪'])(
    'enforces exact result byte boundaries: %s',
    async text => {
      const encodedBytes = Buffer.byteLength(serializeRunValue(text));
      await expect(
        run({
          source: `return ${JSON.stringify(text)};`,
          limits: { maxResultBytes: encodedBytes },
        }),
      ).resolves.toEqual({ status: 'completed', value: text });
      await expect(
        run({
          source: `return ${JSON.stringify(text)};`,
          limits: { maxResultBytes: encodedBytes - 1 },
        }),
      ).rejects.toMatchObject({ code: 'RUN_SERIALIZATION_ERROR' });
    },
  );

  it('preserves prototype-sensitive keys without polluting prototypes', async () => {
    const observe = vi.fn((input: Record<string, unknown>) => ({
      hasOwnProto: Object.hasOwn(input, '__proto__'),
      polluted: ({} as { polluted?: unknown }).polluted,
      input,
    }));
    const result = await run({
      source: `
        return await tools.observe(
          JSON.parse('{"__proto__":{"polluted":true},"constructor":"value","prototype":"value"}')
        );
      `,
      bindings: { tools: { observe } },
    });
    expect(result).toMatchObject({
      status: 'completed',
      value: {
        hasOwnProto: true,
        input: {
          __proto__: { polluted: true },
          constructor: 'value',
          prototype: 'value',
        },
      },
    });
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it('preserves edge values across binding and result boundaries', async () => {
    const result = await run({
      source: `
        return await tools.values({
          array: [undefined, NaN, Infinity, -Infinity],
          object: { omitted: undefined, nan: NaN, infinity: Infinity }
        });
      `,
      bindings: { tools: { values: input => input } },
    });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const value = result.value as {
      array: unknown[];
      object: Record<string, unknown>;
    };
    expect(value.array[0]).toBeUndefined();
    expect(Number.isNaN(value.array[1])).toBe(true);
    expect(value.array.slice(2)).toEqual([Infinity, -Infinity]);
    expect(Object.hasOwn(value.object, 'omitted')).toBe(true);
    expect(value.object.omitted).toBeUndefined();
    expect(Number.isNaN(value.object.nan)).toBe(true);
    expect(value.object.infinity).toBe(Infinity);
  });

  it.each(NON_SERIALIZABLE_OUTPUTS)(
    'rejects a non-serializable binding %s',
    async (_name, output) => {
      await expect(
        run({
          source: 'return await tools.output();',
          bindings: { tools: { output } },
        }),
      ).rejects.toMatchObject({ code: 'RUN_SERIALIZATION_ERROR' });
    },
  );

  it('preserves rich values in resolutions', async () => {
    const observed: unknown[] = [];
    const source = 'return await tools.pause();';
    const bindings = {
      tools: {
        pause: () => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ kind: 'pause' });
          observed.push(context.resume?.resolution);
          return context.resume?.resolution;
        },
      },
    };
    const first = await run({ source, bindings });
    if (first.status !== 'interrupted')
      throw new Error('Expected interruption.');
    const date = new Date('2025-01-02T03:04:05.000Z');
    await expect(
      run({
        source,
        bindings,
        continuation: first.continuation,
        resolutions: [
          { interruptionId: first.interruptions[0]!.id, value: date },
        ],
      }),
    ).resolves.toEqual({ status: 'completed', value: date });
    expect(observed).toEqual([date]);
  });

  it('rejects custom codec state with accessors, cycles, or non-plain values', async () => {
    const malformedStates: unknown[] = [];
    const accessor = state();
    Object.defineProperty(accessor, 'ledger', {
      get() {
        throw new Error('accessor executed');
      },
    });
    malformedStates.push(accessor);
    const cyclic = state() as RunContinuationState & { cycle?: unknown };
    cyclic.cycle = cyclic;
    malformedStates.push(cyclic);
    malformedStates.push({ ...state(), determinism: new Date() });

    for (const malformed of malformedStates) {
      const runner = createRunner({
        continuationCodec: {
          encode: () => 'unused',
          decode: () => malformed as never,
        },
      });
      await expect(
        runner.run({ source: state().source, continuation: 'token' }),
      ).rejects.toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });
    }
  });

  it('bounds and sanitizes serialized errors and hostile properties', () => {
    const error = new Error('x'.repeat(100_000));
    Object.defineProperty(error, 'details', {
      get() {
        throw new Error('details getter');
      },
    });
    error.stack = `Error: secret\n    at data:text/javascript;base64,${'a'.repeat(100_000)}`;
    const serialized = serializeError(error);
    expect(Buffer.byteLength(JSON.stringify(serialized))).toBeLessThanOrEqual(
      64 * 1024,
    );
    expect(serialized.stack).not.toContain('data:text/javascript;base64');
    expect(serialized.details).toBeUndefined();
  });
});

function bindingContext(): BindingContext {
  return {
    abortSignal: new AbortController().signal,
    invocationId: 'invocation-1',
    logicalRunId: 'logical-run-1',
    requestId: 'request-1',
    requestIndex: 1,
    bindingName: 'tools.echo',
    interrupt: () => {
      throw new Error('not used');
    },
  };
}

function state(): RunContinuationState {
  return {
    version: 2,
    runtime: 'run-replay-v2',
    serde: 'run-js-v1',
    source: 'return await tools.pause();',
    logicalRunId: '03'.repeat(16),
    scopeHash: '02'.repeat(32),
    determinism: {
      dateNowMs: 1_700_000_000_000,
      randomSeed: '01'.repeat(16),
    },
    ledger: [
      {
        bindingName: 'tools.pause',
        inputJson: '[[]]',
        status: 'interrupted',
        interruptionId: 'interrupt-1',
        payloadJson: '[{"kind":1},"pause"]',
      },
    ],
  };
}
