import { validateTypes } from '@ai-sdk/provider-utils';
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
  it('defers schema construction until first use', async () => {
    constructed.mockClear();
    await import('./openai-decision-model');
    expect(constructed).not.toHaveBeenCalled();
  });
  it('reuses recursive file-search filters at greater nesting depths', async () => {
    const { fileSearchArgsSchema } = await import('./tool/file-search');
    const leaf = { key: 'topic', type: 'eq', value: 'sdk' };
    const filters = { type: 'and', filters: [{ type: 'or', filters: [leaf] }] };
    await validateTypes({
      value: { vectorStoreIds: ['vs'], filters },
      schema: fileSearchArgsSchema,
    });
    constructed.mockClear();
    await validateTypes({
      value: {
        vectorStoreIds: ['vs'],
        filters: { type: 'and', filters: [filters] },
      },
      schema: fileSearchArgsSchema,
    });
    expect(constructed).not.toHaveBeenCalled();
  });

  it('reuses recursive MCP JSON values at greater nesting depths', async () => {
    const { mcpOutputSchema } = await import('./tool/mcp');
    const value = {
      type: 'call',
      serverLabel: 'server',
      name: 'tool',
      arguments: '{}',
      error: { nested: [1] },
    };
    await validateTypes({ value, schema: mcpOutputSchema });
    constructed.mockClear();
    await validateTypes({
      value: { ...value, error: { deeper: value.error } },
      schema: mcpOutputSchema,
    });
    expect(constructed).not.toHaveBeenCalled();
  });
});
