import { asSchema } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { takoSearch } from './tako-search';

describe('takoSearch', () => {
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

  it('does not declare internal response fields in the output schema', async () => {
    const outputSchema = await asSchema(takoSearch().outputSchema).jsonSchema;
    const serializedSchema = JSON.stringify(outputSchema);

    expect(serializedSchema).not.toContain('relevance_score');
    expect(serializedSchema).not.toContain('citation_number');
  });
});
