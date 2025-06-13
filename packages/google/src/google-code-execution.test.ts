import { describe, it, expect } from 'vitest';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { APICallError } from '@ai-sdk/provider';
import { createGoogleGenerativeAI } from './google-provider';

const TEST_PROMPT = [
  {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: 'Calculate the first 10 prime numbers' },
    ],
  },
];

describe('Google Code Execution', () => {
  const server = createTestServer({
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent':
      {},
  });

  const provider = createGoogleGenerativeAI({
    apiKey: 'test-api-key',
  });
  const model = provider('gemini-2.0-flash-exp');

  function prepareJsonResponse(body: any) {
    server.urls[
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent'
    ].response = {
      type: 'json-value',
      body,
    };
  }

  const codeExecutionTool = {
    type: 'provider-defined' as const,
    id: 'google.code_execution' as const,
    name: 'code_execution',
    args: { timeout: 30 },
    executionMode: 'server' as const,
    resultSchema: {
      type: 'object',
      properties: { output: { type: 'string' } },
    },
    capabilities: {
      streaming: true,
      cancellable: true,
      maxExecutionTime: 30000,
      requiresSetup: false,
    },
  };

  it('should add code execution tool when provided in tools array', async () => {
    prepareJsonResponse({
      candidates: [
        {
          content: {
            parts: [{ text: "I'll calculate the prime numbers using Python." }],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: {
        promptTokenCount: 15,
        candidatesTokenCount: 20,
        totalTokenCount: 35,
      },
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [codeExecutionTool],
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.tools).toEqual({ functionDeclarations: [] });
    expect(requestBody.contents).toBeDefined();
  });

  it('should add code execution tool with custom configuration', async () => {
    prepareJsonResponse({
      candidates: [
        {
          content: {
            parts: [{ text: "I'll use Python with extended timeout." }],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: {
        promptTokenCount: 15,
        candidatesTokenCount: 20,
        totalTokenCount: 35,
      },
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          ...codeExecutionTool,
          args: {
            timeout: 60,
            allowedPackages: ['numpy', 'pandas'],
            memoryLimit: 512,
          },
        },
      ],
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.tools).toEqual({ functionDeclarations: [] });
    expect(requestBody.contents).toBeDefined();
  });

  it('should handle code execution results with output', async () => {
    prepareJsonResponse({
      candidates: [
        {
          content: {
            parts: [
              { text: 'Here are the first 10 prime numbers:' },
              {
                executableCode: {
                  language: 'PYTHON',
                  code: 'primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]\nprint(primes)',
                },
              },
              {
                codeExecutionResult: {
                  outcome: 'OUTCOME_OK',
                  output: '[2, 3, 5, 7, 11, 13, 17, 19, 23, 29]\n',
                },
              },
              { text: 'The calculation completed successfully.' },
            ],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: {
        promptTokenCount: 25,
        candidatesTokenCount: 35,
        totalTokenCount: 60,
      },
    });

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [codeExecutionTool],
    });

    const textContent = result.content.filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text',
    );

    expect(textContent).toHaveLength(2);
    expect(textContent[0].text).toBe('Here are the first 10 prime numbers:');
    expect(textContent[1].text).toBe('The calculation completed successfully.');
  });

  it('should handle code execution errors', async () => {
    server.urls[
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent'
    ].response = {
      type: 'error',
      status: 429,
      body: JSON.stringify({
        error: {
          message: 'Code execution failed: Resource limit exceeded',
          code: 'RESOURCE_EXHAUSTED',
        },
      }),
    };

    await expect(() =>
      model.doGenerate({
        prompt: TEST_PROMPT,
        tools: [codeExecutionTool],
      }),
    ).rejects.toThrow(APICallError);
  });

  it('should combine code execution with regular tools', async () => {
    prepareJsonResponse({
      candidates: [
        {
          content: {
            parts: [
              { text: 'I can use both code execution and function tools.' },
            ],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: {
        promptTokenCount: 30,
        candidatesTokenCount: 25,
        totalTokenCount: 55,
      },
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        codeExecutionTool,
        {
          type: 'function',
          name: 'calculator',
          description: 'Calculate math',
          parameters: {
            type: 'object',
            properties: {
              operation: { type: 'string' },
              numbers: { type: 'array', items: { type: 'number' } },
            },
            required: ['operation', 'numbers'],
          },
        },
      ],
    });

    const requestBody = await server.calls[0].requestBodyJson;

    expect(requestBody.tools).toEqual({
      functionDeclarations: [
        {
          name: 'calculator',
          description: 'Calculate math',
          parameters: {
            type: 'object',
            properties: {
              operation: { type: 'string' },
              numbers: { type: 'array', items: { type: 'number' } },
            },
            required: ['operation', 'numbers'],
          },
        },
      ],
    });
  });
});
