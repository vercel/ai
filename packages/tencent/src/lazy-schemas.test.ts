import { asSchema, type FlexibleSchema } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import type * as Zod from 'zod/v4';

const { constructed } = vi.hoisted(() => ({ constructed: vi.fn() }));

vi.mock('zod/v4', async importOriginal => {
  const actual = await importOriginal<typeof Zod>();
  const factories = new Set([
    'object',
    'looseObject',
    'strictObject',
    'union',
    'discriminatedUnion',
    'enum',
    'string',
    'number',
    'boolean',
    'array',
    'literal',
    'record',
    'any',
    'unknown',
    'lazy',
    'json',
    'never',
    'tuple',
    'intersection',
  ]);
  const wrap = (value: unknown, key: PropertyKey) =>
    typeof value === 'function' && factories.has(String(key))
      ? (...args: unknown[]) => {
          constructed();
          return Reflect.apply(value, undefined, args);
        }
      : value;
  return {
    ...Object.fromEntries(
      Object.entries(actual).map(([key, value]) => [key, wrap(value, key)]),
    ),
    z: new Proxy(actual.z, {
      get: (target, key) => wrap(Reflect.get(target, key), key),
    }),
  };
});

describe('lazy schema initialization', () => {
  it('defers schema construction until first use and caches the validator', async () => {
    constructed.mockClear();
    const { tencentVideoModelOptionsSchema } =
      await import('./tencent-video-model-options');
    const { tencentTokenHubErrorDataSchema } =
      await import('./tencent-tokenhub-error');
    const { tencentCloudEnvelopeSchema } = await import('./tencent-cloud-api');
    const { vodDescribeTaskDetailResponseSchema } =
      await import('./tencent-vod-video');
    const { tokenHubKlingStatusResponseSchema } =
      await import('./tencent-tokenhub-video');
    expect(constructed).not.toHaveBeenCalled();

    const schemas: Array<FlexibleSchema<unknown>> = [
      tencentVideoModelOptionsSchema,
      tencentTokenHubErrorDataSchema,
      tencentCloudEnvelopeSchema,
      vodDescribeTaskDetailResponseSchema,
      tokenHubKlingStatusResponseSchema,
    ];

    for (const schema of schemas) {
      const first = asSchema(schema);
      const count = constructed.mock.calls.length;
      expect(asSchema(schema)).toBe(first);
      expect(constructed).toHaveBeenCalledTimes(count);
    }
    expect(constructed).toHaveBeenCalled();
  });
});
