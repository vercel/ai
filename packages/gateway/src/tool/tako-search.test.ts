import { asSchema, safeValidateTypes } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { gatewayTools } from '../gateway-tools';
import { takoResultContentSchema, takoSearch } from './tako-search';

const validateOutput = (value: unknown) =>
  safeValidateTypes({ value, schema: asSchema(takoSearch().outputSchema) });

const variableCostResponse = () => ({
  request_id: 'req_123',
  cards: [
    {
      card_id: 'card_traffic',
      title: 'vercel.com Traffic Summary',
      description: 'Monthly visits to vercel.com',
      relevance: 'High',
      relevance_score: 4.2,
      source_indexes: ['data'],
      content: {
        content_format: 'json_records',
        records: [{ month: '2026-09', visits: 1000 }],
        total_rows: 1,
        truncated: false,
        premium_rows: { company_record: 1 },
        redacted_cells: { email: [0] },
        total_matching: 12,
        export_pricing: {
          baseline_usd: 0.01,
          max_rows_ceiling: 1000,
          row_cpm_usd: 7,
          premium_row_cpm_usd: { company_record: 20 },
          variable_cost_max_usd: 0.05,
        },
      },
    },
    {
      card_id: 'card_over_cap',
      title: 'vercel.com Backlinks',
      description: 'Withheld',
      placeholder: { withheld_source: 'Semrush', reason: 'over_cap' },
    },
    {
      card_id: 'card_not_served',
      title: 'vercel.com Keywords',
      placeholder: { withheld_source: 'Semrush' },
    },
  ],
  usage: {
    total_cost_usd: 0.08,
    compute: { cost_usd: 0.01 },
    data: { cost_usd: 0.02, datasets: 1, data_points: 2 },
    variable_cost: { cost_usd: 0.05 },
  },
});

describe('takoSearch', () => {
  it('passes developer-only configuration through as camelCase args', () => {
    const config = {
      variableCost: false,
      maxVariableCostUsd: null,
      extraBody: { output_settings: { flat_results: { max_results: 3 } } },
    };
    const tool = gatewayTools.takoSearch(config);

    expect(tool).toMatchObject({
      type: 'provider',
      id: 'gateway.tako_search',
      args: config,
      isProviderExecuted: true,
    });
    expect(tool.args).toHaveProperty('maxVariableCostUsd', null);
  });

  it('keeps developer-only fields out of the input schema', async () => {
    const serializedSchema = JSON.stringify(
      await asSchema(takoSearch().inputSchema).jsonSchema,
    );

    for (const field of [
      'variable_cost',
      'max_variable_cost_usd',
      'extra_body',
      'variableCost',
      'maxVariableCostUsd',
      'extraBody',
    ]) {
      expect(serializedSchema).not.toContain(field);
    }
  });

  it('describes data surcharge controls in the input schema', async () => {
    const inputSchema = await asSchema(takoSearch().inputSchema).jsonSchema;

    expect(inputSchema).toMatchObject({
      properties: {
        sources: {
          properties: {
            data: {
              properties: {
                count: {
                  description: expect.stringContaining('data surcharge'),
                },
                include_contents: {
                  description: expect.stringContaining(
                    'cards.content.export_pricing',
                  ),
                },
                max_rows: {
                  description: expect.stringContaining(
                    'per 1,000 exported rows',
                  ),
                },
              },
            },
          },
        },
      },
    });
  });

  it('accepts a variable-cost response with placeholder cards', async () => {
    const value = variableCostResponse();
    const result = await validateOutput(value);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual(value);
  });

  it('preserves additive fields on usage, pricing and placeholders', async () => {
    const value = variableCostResponse();
    Object.assign(value.usage, { future_field: 1 });
    Object.assign(value.usage.data, { future_field: 2 });
    Object.assign(value.usage.variable_cost, { future_field: 3 });
    Object.assign(value.cards[0].content!.export_pricing, { future_field: 4 });
    Object.assign(value.cards[1].placeholder!, { future_field: 5 });

    const result = await validateOutput(value);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual(value);
  });

  it('still accepts and preserves the deprecated free_rows field', async () => {
    const value = variableCostResponse();
    Object.assign(value.cards[0].content!.export_pricing, { free_rows: 0 });

    const result = await validateOutput(value);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual(value);
  });

  it('exports the result content schema for reuse', () => {
    const content = {
      ...variableCostResponse().cards[0].content,
      future_field: true,
    };
    const result = takoResultContentSchema().safeParse(content);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(content);
  });

  it('declares relevance_score but not citation_number in the output schema', async () => {
    const outputSchema = await asSchema(takoSearch().outputSchema).jsonSchema;
    const serializedSchema = JSON.stringify(outputSchema);

    expect(serializedSchema).toContain('relevance_score');
    expect(serializedSchema).not.toContain('citation_number');
  });
});
