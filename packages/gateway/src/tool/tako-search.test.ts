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
                  description:
                    'Maximum number of data results to return (1-20). When include_contents is true, each additional result adds its own data surcharge.',
                },
                include_contents: {
                  description:
                    'Inline the rows behind each data result. Data contents incur additional data surcharges based on number of rows requested and the underlying dataset source. To estimate the cost before requesting the data, search with include_contents disabled and check the cards.content.export_pricing response field for details. sources.data.include_contents applies to all cards returned by the search, so use sources.data.count and sources.data.max_rows to further clamp down on data export costs.',
                },
                max_rows: {
                  description:
                    'Maximum rows to inline per result. Omit it to return the max allowance set by cards.content.export_pricing. Data surcharge is applied per 1000 rows exported. Lower it to request a smaller number of rows and decrease data surcharges.',
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
