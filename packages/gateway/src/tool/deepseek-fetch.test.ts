import { asSchema, safeValidateTypes } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { gatewayTools } from '../gateway-tools';
import { deepseekFetch } from './deepseek-fetch';

describe('deepseekFetch', () => {
  it('registers a provider-executed tool with an optional pinned URL', () => {
    expect(
      gatewayTools.deepseekFetch({ url: 'https://example.com' }),
    ).toMatchObject({
      type: 'provider',
      id: 'gateway.deepseek_fetch',
      args: { url: 'https://example.com' },
      isProviderExecuted: true,
    });
  });

  it('describes the required fetch URL', async () => {
    expect(
      await asSchema(deepseekFetch().inputSchema).jsonSchema,
    ).toMatchObject({
      required: ['url'],
      properties: { url: { type: 'string', maxLength: 8192 } },
    });
  });

  it.each([
    'file:///etc/passwd',
    'https://user:password@example.com',
    'not a URL',
  ])('rejects invalid URL %s', async url => {
    expect(
      (
        await safeValidateTypes({
          value: { url },
          schema: asSchema(deepseekFetch().inputSchema),
        })
      ).success,
    ).toBe(false);
  });

  it.each([
    { title: '', content: '# Markdown' },
    { title: 'Title', content: '' },
    { error: 'timeout', message: 'Timed out' },
  ])('accepts response %j', async value => {
    expect(
      (
        await safeValidateTypes({
          value,
          schema: asSchema(deepseekFetch().outputSchema),
        })
      ).success,
    ).toBe(true);
  });

  it('rejects a response without content', async () => {
    expect(
      (
        await safeValidateTypes({
          value: { title: 'Title' },
          schema: asSchema(deepseekFetch().outputSchema),
        })
      ).success,
    ).toBe(false);
  });
});
