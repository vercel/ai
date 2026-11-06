import { InvalidArgumentError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { parseProviderOptions } from './parse-provider-options';
import { zodSchema } from './schema';

describe('parseProviderOptions', () => {
  const schema = zodSchema(
    z.object({
      language: z.string().optional(),
      prompt: z.string().optional(),
      temperature: z.number().default(1),
      enabled: z.boolean().optional(),
      nullable: z.string().nullable().optional(),
      nested: z
        .object({ first: z.number().optional(), second: z.number().optional() })
        .optional(),
    }),
  );

  it('preserves single-namespace parsing', async () => {
    expect(
      await parseProviderOptions({
        provider: 'openai',
        providerOptions: { openai: { language: 'en' } },
        schema,
      }),
    ).toEqual({ language: 'en', temperature: 1 });
  });

  it.each([undefined, {}, { unrelated: {} }])(
    'returns undefined when no namespace is present',
    async providerOptions => {
      expect(
        await parseProviderOptions({
          provider: ['openai', 'azure'],
          providerOptions,
          schema,
        }),
      ).toBeUndefined();
    },
  );

  it('merges supplied fields before validation and defaults without mutating input', async () => {
    const providerOptions = {
      openai: { language: 'en', prompt: 'Names', temperature: 0 },
      azure: { language: 'fr', temperature: undefined },
    };
    const original = structuredClone(providerOptions);
    expect(
      await parseProviderOptions({
        provider: ['openai', 'azure'],
        providerOptions,
        schema,
      }),
    ).toEqual({ language: 'fr', prompt: 'Names', temperature: 0 });
    expect(providerOptions).toEqual(original);
  });

  it('does not let an empty namespace shadow lower-priority fields', async () => {
    expect(
      await parseProviderOptions({
        provider: ['openai', 'azure'],
        providerOptions: { openai: { language: 'en' }, azure: {} },
        schema,
      }),
    ).toEqual({ language: 'en', temperature: 1 });
  });

  it('preserves false and null and replaces nested objects atomically', async () => {
    expect(
      await parseProviderOptions({
        provider: ['openai', 'azure'],
        providerOptions: {
          openai: { enabled: true, nullable: 'value', nested: { first: 1 } },
          azure: { enabled: false, nullable: null, nested: { second: 2 } },
        },
        schema,
      }),
    ).toEqual({
      enabled: false,
      nullable: null,
      nested: { second: 2 },
      temperature: 1,
    });
  });

  it.each([42, 'invalid', []])(
    'rejects invalid namespace values: %j',
    async value => {
      await expect(
        parseProviderOptions({
          provider: ['openai', 'azure'],
          providerOptions: { openai: { language: 'en' }, azure: value },
          schema,
        }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
    },
  );

  it('deduplicates namespaces in validation errors', async () => {
    await expect(
      parseProviderOptions({
        provider: ['openai', 'openai'],
        providerOptions: { openai: { language: 42 } },
        schema,
      }),
    ).rejects.toThrow('invalid openai provider options');
  });

  it('validates the merged result', async () => {
    await expect(
      parseProviderOptions({
        provider: ['openai', 'azure'],
        providerOptions: { azure: { language: 42 } },
        schema,
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });
});
