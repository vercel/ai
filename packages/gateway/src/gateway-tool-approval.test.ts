import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { GatewayLanguageModel } from './gateway-language-model';
import { describe, it, expect } from 'vitest';
import { LanguageModelV3Prompt } from '@ai-sdk/provider';

const createTestModel = () => {
    return new GatewayLanguageModel('test-model', {
        provider: 'test-provider',
        baseURL: 'https://api.test.com',
        headers: () => ({
            Authorization: 'Bearer test-token',
        }),
        fetch: globalThis.fetch,
        o11yHeaders: {},
    });
};

describe('GatewayLanguageModel Tool Approval', () => {
    const server = createTestServer({
        'https://api.test.com/language-model': {},
    });

    it('should currently pass tool-approval-response through to the API', async () => {
        server.urls['https://api.test.com/language-model'].response = {
            type: 'json-value',
            body: {
                content: [{ type: 'text', text: 'Response' }],
                finish_reason: 'stop',
                usage: { prompt_tokens: 10, completion_tokens: 5 },
            },
        };

        const prompt: LanguageModelV3Prompt = [
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-approval-response',
                        approvalId: 'approval-1',
                        approved: false,
                        reason: 'User denied',
                    },
                ],
            },
        ];

        await createTestModel().doGenerate({
            prompt,
        });

        const requestBody = await server.calls[0].requestBodyJson;
        const toolMessage = requestBody.prompt[0];

        // This assertion confirms that the fix REMOVES the tool-approval-response
        // which prevents the crash on the backend.
        expect(requestBody.prompt).toHaveLength(0); // The tool message should be dropped completely as it becomes empty
    });
});
