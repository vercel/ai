import { asSchema, safeValidateTypes } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { gatewayTools } from '../gateway-tools';
import { takoContents } from './tako-contents';

const validateOutput = (value: unknown) =>
  safeValidateTypes({ value, schema: asSchema(takoContents().outputSchema) });

const cardExport = () => ({
  request_id: 'contents-1',
  contents: [
    {
      source_url: 'https://tako.com/card/abc/',
      delivery: 'inline',
      description: 'Intel quarterly revenue since 2020.',
      content_format: 'csv',
      cost: 0.021,
      data: 'Timestamp,Revenue\n2025-12-31 00:00:00+00:00,13.7',
      total_rows: 1,
      truncated: false,
      offset: 0,
      premium: false,
      export_pricing: {
        baseline_usd: 0.001,
        max_rows_ceiling: 100000,
        row_cpm_usd: 0.01,
      },
    },
  ],
  usage: {
    total_cost_usd: 0.021,
    data: { cost_usd: 0.021, datasets: 1, data_points: 2 },
  },
});

describe('takoContents', () => {
  it('passes configuration through as camelCase args', () => {
    const config = {
      mode: 'url' as const,
      contentFormat: 'csv' as const,
      maxRows: 500,
      maxChars: 10000,
      premium: true,
      maxCostUsd: 2.5,
      extraBody: { zdr: true },
    };

    expect(gatewayTools.takoContents(config)).toMatchObject({
      type: 'provider',
      id: 'gateway.tako_contents',
      args: config,
      isProviderExecuted: true,
    });
  });

  it('describes the model-facing Tako Contents inputs', async () => {
    const inputSchema = await asSchema(takoContents().inputSchema).jsonSchema;

    expect(inputSchema).toMatchObject({
      required: ['url'],
      properties: {
        url: { type: 'string' },
        mode: { enum: ['inline', 'url'] },
        content_format: {
          enum: ['card_json', 'csv', 'json_compact', 'json_records'],
        },
        max_rows: {
          type: 'number',
          description: expect.stringContaining('per 1,000 exported rows'),
        },
        offset: { type: 'number' },
        max_chars: { type: 'number' },
        highlights: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            max_characters: { type: 'number' },
          },
        },
        quote_only: { type: 'boolean' },
      },
    });
  });

  it('keeps developer-only fields out of the input schema', async () => {
    const inputSchema = await asSchema(takoContents().inputSchema).jsonSchema;
    const serializedSchema = JSON.stringify(inputSchema);

    expect(Object.keys(inputSchema.properties ?? {})).not.toContain('premium');
    for (const field of [
      'max_cost_usd',
      'extra_body',
      'maxCostUsd',
      'extraBody',
    ]) {
      expect(serializedSchema).not.toContain(field);
    }
  });

  it('accepts inline card rows', async () => {
    const value = cardExport();
    const result = await validateOutput(value);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual(value);
  });

  it('preserves additive fields on the response, items, pricing and usage', async () => {
    const value = cardExport();
    Object.assign(value, { future_field: 1 });
    Object.assign(value.contents[0], { future_field: 2 });
    Object.assign(value.contents[0].export_pricing, { future_field: 3 });
    Object.assign(value.usage, { future_field: 4 });
    Object.assign(value.usage.data, { future_field: 5 });

    const result = await validateOutput(value);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual(value);
  });

  it('accepts a price quote', async () => {
    const value = {
      request_id: 'contents-2',
      contents: [
        {
          source_url: 'https://tako.com/card/abc/',
          delivery: 'quote',
          description: null,
          content_format: null,
          cost: 0.42,
          data: null,
          url: null,
          offset: null,
          export_pricing: {
            baseline_usd: 0.001,
            max_rows_ceiling: 100000,
            row_cpm_usd: 0.5,
            premium_row_cpm_usd: { company_record: 20 },
            variable_cost_max_usd: 0.25,
          },
          premium_rows: { company_record: 12 },
        },
      ],
      usage: { total_cost_usd: 0 },
    };

    const result = await validateOutput(value);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual(value);
  });

  it('accepts a premium export with withheld cells and variable cost', async () => {
    const value = {
      request_id: 'contents-3',
      contents: [
        {
          source_url: 'https://tako.com/card/abc/',
          delivery: 'inline',
          content_format: 'csv',
          cost: 0.31,
          data: 'Company,Email\nAcme,[premium: withheld]',
          total_rows: 1,
          truncated: false,
          premium: false,
          premium_rows: { person_contact: 1 },
          redacted_cells: { Email: [0] },
        },
      ],
      usage: {
        total_cost_usd: 0.33,
        data: { cost_usd: 0.31, datasets: 1 },
        variable_cost: { cost_usd: 0.02 },
      },
    };

    const result = await validateOutput(value);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual(value);
  });

  it('accepts a card download link', async () => {
    const result = await validateOutput({
      request_id: 'contents-4',
      contents: [
        {
          source_url: 'https://tako.com/card/abc/',
          delivery: 'url',
          content_format: 'csv',
          cost: 0.05,
          url: 'https://downloads.tako.com/exports/abc.csv?signature=xyz',
          expires_at: '2026-10-26T18:30:00Z',
          total_rows: 12000,
          truncated: false,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('accepts extracted web page text', async () => {
    const result = await validateOutput({
      request_id: 'contents-5',
      contents: [
        {
          source_url: 'https://example.com/article',
          delivery: 'inline',
          description: null,
          content_format: null,
          cost: 0.001,
          data: 'Example Domain\n\nThis domain is for use in examples.',
          truncated: false,
        },
      ],
      usage: null,
    });

    expect(result.success).toBe(true);
  });

  it('accepts a cost-cap refusal', async () => {
    const result = await validateOutput({
      error: 'invalid_input',
      statusCode: 422,
      statusText: 'Unprocessable Entity',
      message:
        "This export would cost up to $2.50, above this application's $1.00 limit per call.",
    });

    expect(result.success).toBe(true);
  });

  it('rejects a content item missing source_url', async () => {
    const result = await validateOutput({
      request_id: 'contents-6',
      contents: [{ content_format: 'csv', data: 'a,b\n1,2' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown delivery', async () => {
    const value = cardExport();
    Object.assign(value.contents[0], { delivery: 'email' });

    const result = await validateOutput(value);

    expect(result.success).toBe(false);
  });
});
