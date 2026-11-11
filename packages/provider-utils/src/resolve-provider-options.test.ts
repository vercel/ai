import { InvalidArgumentError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { resolveProviderOptions } from './resolve-provider-options';
import { zodSchema } from './schema';

const schema = zodSchema(
  z.object({
    a: z.string().optional(),
    b: z.number().optional(),
  }),
);

describe('resolveProviderOptions', () => {
  describe('first', () => {
    it('returns the first present namespace as a whole', async () => {
      const result = await resolveProviderOptions({
        providerOptions: { second: { a: 'second' }, third: { b: 3 } },
        namespaces: ['first', 'second', 'third'],
        resolution: 'first',
        schema,
      });

      expect(result).toEqual({
        options: { a: 'second' },
        namespaces: ['second'],
      });
    });

    it('treats an empty object as present', async () => {
      const result = await resolveProviderOptions({
        providerOptions: { first: {}, second: { a: 'second' } },
        namespaces: ['first', 'second'],
        resolution: 'first',
        schema,
      });

      expect(result).toEqual({ options: {}, namespaces: ['first'] });
    });

    it('does not validate namespaces after the first present one', async () => {
      const result = await resolveProviderOptions({
        providerOptions: { first: { a: 'first' }, second: { b: 'invalid' } },
        namespaces: ['first', 'second'],
        resolution: 'first',
        schema,
      });

      expect(result.options).toEqual({ a: 'first' });
    });
  });

  describe('merge', () => {
    it('merges present namespaces in order, later namespaces win', async () => {
      const result = await resolveProviderOptions({
        providerOptions: {
          first: { a: 'first', b: 1 },
          third: { a: 'third' },
        },
        namespaces: ['first', 'second', 'third'],
        resolution: 'merge',
        schema,
      });

      expect(result).toEqual({
        options: { a: 'third', b: 1 },
        namespaces: ['first', 'third'],
      });
    });

    it('ignores duplicate namespaces', async () => {
      const result = await resolveProviderOptions({
        providerOptions: { first: { a: 'first' } },
        namespaces: ['first', 'first'],
        resolution: 'merge',
        schema,
      });

      expect(result).toEqual({
        options: { a: 'first' },
        namespaces: ['first'],
      });
    });
  });

  it.each(['first', 'merge'] as const)(
    'returns undefined options when no namespace is present (%s)',
    async resolution => {
      const result = await resolveProviderOptions({
        providerOptions: { other: { a: 'other' } },
        namespaces: ['first', 'second'],
        resolution,
        schema,
      });

      expect(result).toEqual({ options: undefined, namespaces: [] });
    },
  );

  it.each(['first', 'merge'] as const)(
    'throws for invalid options in a present namespace (%s)',
    async resolution => {
      await expect(
        resolveProviderOptions({
          providerOptions: { second: { b: 'invalid' } },
          namespaces: ['first', 'second'],
          resolution,
          schema,
        }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
    },
  );
});
