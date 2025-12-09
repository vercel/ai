import { describe, it, expect } from 'vitest';
import { webFetch_20250910OutputSchema } from './web-fetch-20250910';

describe('webFetch_20250910OutputSchema', () => {
  it('should not fail validation when title is null', async () => {
    const problematicResponse = {
      type: 'web_fetch_result',
      url: 'https://test.com',
      retrievedAt: '2025-12-08T20:46:31.114158',
      content: {
        type: 'document',
        title: null,
        source: {
          type: 'text',
          mediaType: 'text/plain',
          data: '',
        },
      },
    };

    const schema = webFetch_20250910OutputSchema();

    const result = await schema.validate!(problematicResponse);

    expect(result.success).toBe(true);
  });

  it('should accept valid response with string title', async () => {
    const validResponse = {
      type: 'web_fetch_result',
      url: 'https://test.com',
      retrievedAt: '2025-12-08T20:46:31.114158',
      content: {
        type: 'document',
        title: 'Example Title',
        source: {
          type: 'text',
          mediaType: 'text/plain',
          data: 'Some content',
        },
      },
    };

    const schema = webFetch_20250910OutputSchema();
    const result = await schema.validate!(validResponse);

    expect(result.success).toBe(true);
  });
});
