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

    it('should filter out tool-approval-response messages from the prompt', async () => {
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

        // The tool message should be dropped completely as it becomes empty
        expect(requestBody.prompt).toHaveLength(0);
    });

    it('should filter out tool-approval-response parts while keeping other content in tool messages', async () => {
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
                        type: 'tool-result',
                        toolCallId: 'call-1',
                        toolName: 'test-tool',
                        result: 'result',
                    },
                    {
                        type: 'tool-approval-response',
                        approvalId: 'approval-1',
                        approved: true,
                        reason: 'User approved',
                    },
                ],
            },
        ];

        await createTestModel().doGenerate({
            prompt,
        });

        const requestBody = await server.calls[0].requestBodyJson;

        expect(requestBody.prompt).toHaveLength(1);
        expect(requestBody.prompt[0].role).toBe('tool');
        expect(requestBody.prompt[0].content).toHaveLength(1);
        expect(requestBody.prompt[0].content[0]).toEqual({
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'test-tool',
            result: 'result',
        });
    });

    it('should handle multiple tool messages with mixed content', async () => {
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
                        type: 'tool-result',
                        toolCallId: 'call-1',
                        toolName: 'tool-1',
                        result: 'result-1',
                    },
                ],
            },
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-approval-response',
                        approvalId: 'approval-1',
                        approved: false,
                    },
                ],
            },
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-approval-response',
                        approvalId: 'approval-2',
                        approved: true,
                    },
                    {
                        type: 'tool-result',
                        toolCallId: 'call-2',
                        toolName: 'tool-2',
                        result: 'result-2',
                    },
                ],
            },
        ];

        await createTestModel().doGenerate({
            prompt,
        });

        const requestBody = await server.calls[0].requestBodyJson;

        expect(requestBody.prompt).toHaveLength(2);

        // First message should be preserved as is
        expect(requestBody.prompt[0]).toEqual({
            role: 'tool',
            content: [{
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'tool-1',
                result: 'result-1',
            }],
        });

        // Second original message (pure approval) should be dropped

        // Third original message should be filtered
        expect(requestBody.prompt[1]).toEqual({
            role: 'tool',
            content: [{
                type: 'tool-result',
                toolCallId: 'call-2',
                toolName: 'tool-2',
                result: 'result-2',
            }],
        });
    });

    it('should handle mixed non-tool messages correctly', async () => {
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
                role: 'user',
                content: [{ type: 'text', text: 'Hello' }],
            },
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-approval-response',
                        approvalId: 'approval-1',
                        approved: true,
                    },
                ],
            },
            {
                role: 'assistant',
                content: [{ type: 'text', text: 'Hi' }],
            },
        ];

        await createTestModel().doGenerate({
            prompt,
        });

        const requestBody = await server.calls[0].requestBodyJson;

        expect(requestBody.prompt).toHaveLength(2);
        expect(requestBody.prompt[0].role).toBe('user');
        expect(requestBody.prompt[1].role).toBe('assistant');
    });
});
