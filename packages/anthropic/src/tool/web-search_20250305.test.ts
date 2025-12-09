import { describe, it, expect } from 'vitest';
import { webSearch_20250305OutputSchema } from './web-search_20250305';

describe('webFetch_20250910OutputSchema', () => {
    it('should not fail validation when title is null', async () => {
        const problematicResponse = [{
            url: 'https://test.com',
            title: null,
            pageAge: 'April 30, 2025',
            encryptedContent: 'EqgfCioIARgBIiQ3YTAwMjY1Mi1mZjM5LTQ1NGUtODgxNC1kNjNjNTk1ZWI3Y...',
            type: 'web_search_result',
        }];

        const schema = webSearch_20250305OutputSchema();

        const result = await schema.validate!(problematicResponse);

        expect(result.success).toBe(true);
    });

    it('should accept valid response with string title', async () => {
        const validResponse = [{
            url: 'https://test.com',
            title: 'Test title',
            pageAge: 'April 30, 2025',
            encryptedContent: 'EqgfCioIARgBIiQ3YTAwMjY1Mi1mZjM5LTQ1NGUtODgxNC1kNjNjNTk1ZWI3Y...',
            type: 'web_search_result',
        }];

        const schema = webSearch_20250305OutputSchema();
        const result = await schema.validate!(validResponse);

        expect(result.success).toBe(true);
    });
});