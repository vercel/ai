import { asSchema, safeValidateTypes } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { browserbaseFetch } from './browserbase-fetch';

describe('browserbaseFetch', () => {
  it('creates a provider-executed Browserbase Fetch tool', () => {
    expect(
      browserbaseFetch({
        allowRedirects: true,
        format: 'markdown',
        proxies: true,
      }),
    ).toMatchObject({
      type: 'provider',
      id: 'gateway.browserbase_fetch',
      args: {
        allowRedirects: true,
        format: 'markdown',
        proxies: true,
      },
      isProviderExecuted: true,
    });
  });

  it('describes all Browserbase Fetch API inputs', async () => {
    const inputSchema = await asSchema(browserbaseFetch().inputSchema)
      .jsonSchema;

    expect(inputSchema).toMatchObject({
      required: ['url'],
      properties: {
        url: { type: 'string' },
        allow_redirects: { type: 'boolean' },
        allow_insecure_ssl: { type: 'boolean' },
        proxies: { type: 'boolean' },
        format: { enum: ['raw', 'json', 'markdown'] },
        schema: { type: 'object' },
      },
    });
  });

  it('validates a Browserbase Fetch API success response', async () => {
    const result = await safeValidateTypes({
      value: {
        id: 'fetch_9f8e7d6c5b4a',
        statusCode: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'max-age=0',
        },
        content: '<!DOCTYPE html><html><body>Example</body></html>',
        contentType: 'text/html; charset=utf-8',
        encoding: 'utf-8',
      },
      schema: asSchema(browserbaseFetch().outputSchema),
    });

    expect(result.success).toBe(true);
  });

  it('validates a JSON-extraction success response', async () => {
    const result = await safeValidateTypes({
      value: {
        id: 'fetch_1a2b3c4d5e6f',
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        content: { title: 'Example Domain', price: 42 },
        contentType: 'text/html',
        encoding: 'utf-8',
      },
      schema: asSchema(browserbaseFetch().outputSchema),
    });

    expect(result.success).toBe(true);
  });

  it('validates a Browserbase Fetch API error response', async () => {
    const result = await safeValidateTypes({
      value: {
        error: 'rate_limit',
        statusCode: 429,
        message: 'Rate limit exceeded',
      },
      schema: asSchema(browserbaseFetch().outputSchema),
    });

    expect(result.success).toBe(true);
  });

  it('rejects a success response missing id', async () => {
    const result = await safeValidateTypes({
      value: {
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        content: '<!DOCTYPE html><html><body>Example</body></html>',
        contentType: 'text/html; charset=utf-8',
        encoding: 'utf-8',
      },
      schema: asSchema(browserbaseFetch().outputSchema),
    });

    expect(result.success).toBe(false);
  });
});
