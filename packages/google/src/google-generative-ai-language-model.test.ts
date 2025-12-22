import {
  LanguageModelV3Prompt,
  LanguageModelV3ProviderTool,
} from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import {
  GoogleGenerativeAILanguageModel,
  getGroundingMetadataSchema,
  getUrlContextMetadataSchema,
} from './google-generative-ai-language-model';

import {
  GoogleGenerativeAIGroundingMetadata,
  GoogleGenerativeAIUrlContextMetadata,
} from './google-generative-ai-prompt';
import { createGoogleGenerativeAI } from './google-provider';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const SAFETY_RATINGS = [
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    probability: 'NEGLIGIBLE',
  },
  {
    category: 'HARM_CATEGORY_HATE_SPEECH',
    probability: 'NEGLIGIBLE',
  },
  {
    category: 'HARM_CATEGORY_HARASSMENT',
    probability: 'NEGLIGIBLE',
  },
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    probability: 'NEGLIGIBLE',
  },
];

const provider = createGoogleGenerativeAI({
  apiKey: 'test-api-key',
  generateId: () => 'test-id',
});
const model = provider.chat('gemini-pro');

const groundingMetadataSchema = getGroundingMetadataSchema();
const urlContextMetadataSchema = getUrlContextMetadataSchema();

describe('groundingMetadataSchema', () => {
  it('validates complete grounding metadata with web search results', () => {
    const metadata = {
      webSearchQueries: ["What's the weather in Chicago this weekend?"],
      searchEntryPoint: {
        renderedContent: 'Sample rendered content for search results',
      },
      groundingChunks: [
        {
          web: {
            uri: 'https://example.com/weather',
            title: 'Chicago Weather Forecast',
          },
        },
      ],
      groundingSupports: [
        {
          segment: {
            startIndex: 0,
            endIndex: 65,
            text: 'Chicago weather changes rapidly, so layers let you adjust easily.',
          },
          groundingChunkIndices: [0],
          confidenceScores: [0.99],
        },
      ],
      retrievalMetadata: {
        webDynamicRetrievalScore: 0.96879,
      },
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates groundingChunks[].web with missing title', () => {
    const metadata = {
      groundingChunks: [
        {
          web: {
            // Missing `title`
            uri: 'https://example.com/weather',
          },
        },
      ],
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates complete grounding metadata with Vertex AI Search results', () => {
    const metadata = {
      retrievalQueries: ['How to make appointment to renew driving license?'],
      groundingChunks: [
        {
          retrievedContext: {
            uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AXiHM.....QTN92V5ePQ==',
            title: 'dmv',
          },
        },
      ],
      groundingSupports: [
        {
          segment: {
            startIndex: 25,
            endIndex: 147,
          },
          segment_text: 'ipsum lorem ...',
          supportChunkIndices: [1, 2],
          confidenceScore: [0.9541752, 0.97726375],
        },
      ],
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates groundingChunks[].retrievedContext with missing title', () => {
    const metadata = {
      groundingChunks: [
        {
          retrievedContext: {
            // Missing `title`
            uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AXiHM.....QTN92V5ePQ==',
          },
        },
      ],
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates groundingChunks[].retrievedContext with fileSearchStore (new format)', () => {
    const metadata = {
      groundingChunks: [
        {
          retrievedContext: {
            text: 'Sample content for testing...',
            fileSearchStore: 'fileSearchStores/test-store-xyz',
            title: 'Test Document',
          },
        },
      ],
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates groundingChunks[].retrievedContext with fileSearchStore and missing uri', () => {
    const metadata = {
      groundingChunks: [
        {
          retrievedContext: {
            text: 'Content without uri field',
            fileSearchStore: 'fileSearchStores/store-abc',
            // Missing `uri` - should still be valid
          },
        },
      ],
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates partial grounding metadata', () => {
    const metadata = {
      webSearchQueries: ['sample query'],
      // Missing other optional fields
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates empty grounding metadata', () => {
    const metadata = {};

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates grounding metadata with maps chunks', () => {
    const metadata = {
      groundingChunks: [
        {
          maps: {
            uri: 'https://maps.google.com/maps?cid=12345',
            title: 'Best Italian Restaurant',
            text: 'A great Italian restaurant',
            placeId: 'ChIJ12345',
          },
        },
      ],
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates groundingChunks[].maps with missing optional fields', () => {
    const metadata = {
      groundingChunks: [
        {
          maps: {
            uri: 'https://maps.google.com/maps?cid=12345',
          },
        },
      ],
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates metadata with empty retrievalMetadata', () => {
    const metadata = {
      webSearchQueries: ['sample query'],
      retrievalMetadata: {},
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('rejects invalid data types', () => {
    const metadata = {
      webSearchQueries: 'not an array', // Should be an array
      groundingSupports: [
        {
          confidenceScores: 'not an array', // Should be an array of numbers
        },
      ],
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(false);
  });
});

describe('urlContextMetadata', () => {
  it('validates complete url context output', () => {
    const output = {
      urlMetadata: [
        {
          retrievedUrl: 'https://example.com/weather',
          urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS',
        },
      ],
    };

    const result = urlContextMetadataSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  it('validates empty url context output', () => {
    const output = {
      urlMetadata: [],
    };

    const result = urlContextMetadataSchema.safeParse(output);
    expect(result.success).toBe(true);
  });
});

describe('doGenerate', () => {
  const TEST_URL_GEMINI_PRO =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

  const TEST_URL_GEMINI_2_0_PRO =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-pro:generateContent';

  const TEST_URL_GEMINI_2_0_FLASH_EXP =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

  const TEST_URL_GEMINI_1_0_PRO =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent';

  const TEST_URL_GEMINI_1_5_FLASH =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

  const server = createTestServer({
    [TEST_URL_GEMINI_PRO]: {},
    [TEST_URL_GEMINI_2_0_PRO]: {},
    [TEST_URL_GEMINI_2_0_FLASH_EXP]: {},
    [TEST_URL_GEMINI_1_0_PRO]: {},
    [TEST_URL_GEMINI_1_5_FLASH]: {},
  });

  const prepareJsonResponse = ({
    content = '',
    usage = {
      promptTokenCount: 1,
      candidatesTokenCount: 2,
      totalTokenCount: 3,
    },
    headers,
    groundingMetadata,
    url = TEST_URL_GEMINI_PRO,
  }: {
    content?: string;
    usage?: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    };
    headers?: Record<string, string>;
    groundingMetadata?: GoogleGenerativeAIGroundingMetadata;
    url?:
      | typeof TEST_URL_GEMINI_PRO
      | typeof TEST_URL_GEMINI_2_0_PRO
      | typeof TEST_URL_GEMINI_2_0_FLASH_EXP
      | typeof TEST_URL_GEMINI_1_0_PRO
      | typeof TEST_URL_GEMINI_1_5_FLASH;
  }) => {
    server.urls[url].response = {
      type: 'json-value',
      headers,
      body: {
        candidates: [
          {
            content: {
              parts: [{ text: content }],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: SAFETY_RATINGS,
            ...(groundingMetadata && { groundingMetadata }),
          },
        ],
        promptFeedback: { safetyRatings: SAFETY_RATINGS },
        usageMetadata: usage,
      },
    };
  };

  it('should extract text response', async () => {
    prepareJsonResponse({ content: 'Hello, World!' });

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "providerMetadata": undefined,
          "text": "Hello, World!",
          "type": "text",
        },
      ]
    `);
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      usage: {
        promptTokenCount: 20,
        candidatesTokenCount: 5,
        totalTokenCount: 25,
      },
    });

    const { usage } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(usage).toMatchInlineSnapshot(`
      {
        "inputTokens": {
          "cacheRead": 0,
          "cacheWrite": undefined,
          "noCache": 20,
          "total": 20,
        },
        "outputTokens": {
          "reasoning": 0,
          "text": 5,
          "total": 5,
        },
        "raw": {
          "candidatesTokenCount": 5,
          "promptTokenCount": 20,
          "totalTokenCount": 25,
        },
      }
    `);
  });
  it('should handle MALFORMED_FUNCTION_CALL finish reason and empty content object', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: {},
            finishReason: 'MALFORMED_FUNCTION_CALL',
          },
        ],
        usageMetadata: {
          promptTokenCount: 9056,
          totalTokenCount: 9056,
          promptTokensDetails: [
            {
              modality: 'TEXT',
              tokenCount: 9056,
            },
          ],
        },
        modelVersion: 'gemini-2.0-flash-lite',
      },
    };

    const { content, finishReason } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`[]`);
    expect(finishReason).toMatchInlineSnapshot(`
      {
        "raw": "MALFORMED_FUNCTION_CALL",
        "unified": "error",
      }
    `);
  });

  it('should extract tool calls', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'test-tool',
                    args: { value: 'example value' },
                  },
                },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: SAFETY_RATINGS,
          },
        ],
        promptFeedback: { safetyRatings: SAFETY_RATINGS },
      },
    };

    const { content, finishReason } = await model.doGenerate({
      tools: [
        {
          type: 'function',
          name: 'test-tool',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      ],
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "input": "{"value":"example value"}",
          "providerMetadata": undefined,
          "toolCallId": "test-id",
          "toolName": "test-tool",
          "type": "tool-call",
        },
      ]
    `);
    expect(finishReason).toMatchInlineSnapshot(`
      {
        "raw": "STOP",
        "unified": "tool-calls",
      }
    `);
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse({ headers: { 'test-header': 'test-value' } });

    const { response } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(response?.headers).toStrictEqual({
      // default headers:
      'content-length': '804',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass the model, messages, and options', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: [
        { role: 'system', content: 'test system instruction' },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
      seed: 123,
      temperature: 0.5,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello' }],
        },
      ],
      systemInstruction: { parts: [{ text: 'test system instruction' }] },
      generationConfig: {
        seed: 123,
        temperature: 0.5,
      },
    });
  });

  it('should only pass valid provider options', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: [
        { role: 'system', content: 'test system instruction' },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
      seed: 123,
      temperature: 0.5,
      providerOptions: {
        google: { foo: 'bar', responseModalities: ['TEXT', 'IMAGE'] },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello' }],
        },
      ],
      systemInstruction: { parts: [{ text: 'test system instruction' }] },
      generationConfig: {
        seed: 123,
        temperature: 0.5,
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });
  });

  it('should pass tools and toolChoice', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      tools: [
        {
          type: 'function',
          name: 'test-tool',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      ],
      toolChoice: {
        type: 'tool',
        toolName: 'test-tool',
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      generationConfig: {},
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      tools: [
        {
          functionDeclarations: [
            {
              name: 'test-tool',
              description: '',
              parameters: {
                type: 'object',
                properties: { value: { type: 'string' } },
                required: ['value'],
              },
            },
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: ['test-tool'],
        },
      },
    });
  });

  it('should set response mime type with responseFormat', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: { location: { type: 'string' } },
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello' }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
            },
          },
        },
      },
    });
  });

  it('should pass specification with responseFormat and structuredOutputs = true (default)', async () => {
    prepareJsonResponse({});

    await provider.languageModel('gemini-pro').doGenerate({
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: {
            property1: { type: 'string' },
            property2: { type: 'number' },
          },
          required: ['property1', 'property2'],
          additionalProperties: false,
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          properties: {
            property1: { type: 'string' },
            property2: { type: 'number' },
          },
          required: ['property1', 'property2'],
          type: 'object',
        },
      },
    });
  });

  it('should not pass specification with responseFormat and structuredOutputs = false', async () => {
    prepareJsonResponse({});

    await provider.languageModel('gemini-pro').doGenerate({
      providerOptions: {
        google: {
          structuredOutputs: false,
        },
      },
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: {
            property1: { type: 'string' },
            property2: { type: 'number' },
          },
          required: ['property1', 'property2'],
          additionalProperties: false,
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
  });

  it('should pass tools and toolChoice', async () => {
    prepareJsonResponse({});

    await provider.languageModel('gemini-pro').doGenerate({
      tools: [
        {
          name: 'test-tool',
          type: 'function',
          inputSchema: {
            type: 'object',
            properties: {
              property1: { type: 'string' },
              property2: { type: 'number' },
            },
            required: ['property1', 'property2'],
            additionalProperties: false,
          },
        },
      ],
      toolChoice: { type: 'required' },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      generationConfig: {},
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'test-tool',
              description: '',
              parameters: {
                properties: {
                  property1: { type: 'string' },
                  property2: { type: 'number' },
                },
                required: ['property1', 'property2'],
                type: 'object',
              },
            },
          ],
        },
      ],
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse({});

    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.chat('gemini-pro').doGenerate({
      prompt: TEST_PROMPT,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = server.calls[0].requestHeaders;

    expect(requestHeaders).toStrictEqual({
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      'x-goog-api-key': 'test-api-key',
    });
    expect(server.calls[0].requestUserAgent).toContain(
      `ai-sdk/google/0.0.0-test`,
    );
  });

  it('should pass response format', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
          },
          required: ['text'],
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
          },
          required: ['text'],
        },
      },
    });
  });

  it('should send request body', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      generationConfig: {},
    });
  });

  it('should extract sources from grounding metadata', async () => {
    prepareJsonResponse({
      content: 'test response',
      groundingMetadata: {
        groundingChunks: [
          {
            web: { uri: 'https://source.example.com', title: 'Source Title' },
          },
        ],
      },
    });

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "providerMetadata": undefined,
          "text": "test response",
          "type": "text",
        },
        {
          "id": "test-id",
          "sourceType": "url",
          "title": "Source Title",
          "type": "source",
          "url": "https://source.example.com",
        },
      ]
    `);
  });

  it('should extract sources from RAG retrievedContext chunks', async () => {
    prepareJsonResponse({
      content: 'test response with RAG',
      groundingMetadata: {
        groundingChunks: [
          {
            web: { uri: 'https://web.example.com', title: 'Web Source' },
          },
          {
            retrievedContext: {
              uri: 'gs://rag-corpus/document.pdf',
              title: 'RAG Document',
              text: 'Retrieved context...',
            },
          },
          {
            retrievedContext: {
              uri: 'https://external-rag-source.com/page',
              title: 'External RAG Source',
              text: 'External retrieved context...',
            },
          },
        ],
      },
    });

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": undefined,
              "text": "test response with RAG",
              "type": "text",
            },
            {
              "id": "test-id",
              "sourceType": "url",
              "title": "Web Source",
              "type": "source",
              "url": "https://web.example.com",
            },
            {
              "filename": "document.pdf",
              "id": "test-id",
              "mediaType": "application/pdf",
              "sourceType": "document",
              "title": "RAG Document",
              "type": "source",
            },
            {
              "id": "test-id",
              "sourceType": "url",
              "title": "External RAG Source",
              "type": "source",
              "url": "https://external-rag-source.com/page",
            },
          ]
        `);
  });

  it('should extract sources from File Search retrievedContext (new format)', async () => {
    prepareJsonResponse({
      content: 'test response with File Search',
      groundingMetadata: {
        groundingChunks: [
          {
            retrievedContext: {
              text: 'Sample content for testing...',
              fileSearchStore: 'fileSearchStores/test-store-xyz',
              title: 'Test Document',
            },
          },
          {
            retrievedContext: {
              text: 'Another document content...',
              fileSearchStore: 'fileSearchStores/another-store-abc',
              // Missing title - should default to 'Unknown Document'
            },
          },
        ],
      },
    });

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": undefined,
              "text": "test response with File Search",
              "type": "text",
            },
            {
              "filename": "test-store-xyz",
              "id": "test-id",
              "mediaType": "application/octet-stream",
              "sourceType": "document",
              "title": "Test Document",
              "type": "source",
            },
            {
              "filename": "another-store-abc",
              "id": "test-id",
              "mediaType": "application/octet-stream",
              "sourceType": "document",
              "title": "Unknown Document",
              "type": "source",
            },
          ]
        `);
  });

  it('should handle URL sources with undefined title correctly', async () => {
    prepareJsonResponse({
      content: 'test response with URLs',
      groundingMetadata: {
        groundingChunks: [
          {
            web: {
              uri: 'https://example.com/page1',
              // No title provided
            },
          },
          {
            retrievedContext: {
              uri: 'https://example.com/page2',
              // No title provided
            },
          },
        ],
      },
    });

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": undefined,
              "text": "test response with URLs",
              "type": "text",
            },
            {
              "id": "test-id",
              "sourceType": "url",
              "title": undefined,
              "type": "source",
              "url": "https://example.com/page1",
            },
            {
              "id": "test-id",
              "sourceType": "url",
              "title": undefined,
              "type": "source",
              "url": "https://example.com/page2",
            },
          ]
        `);
  });

  it('should extract sources from maps grounding metadata', async () => {
    prepareJsonResponse({
      content: 'test response with Maps',
      groundingMetadata: {
        groundingChunks: [
          {
            maps: {
              uri: 'https://maps.google.com/maps?cid=12345',
              title: 'Best Italian Restaurant',
              placeId: 'ChIJ12345',
            },
          },
          {
            maps: {
              uri: 'https://maps.google.com/maps?cid=67890',
            },
          },
        ],
      },
    });

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "providerMetadata": undefined,
          "text": "test response with Maps",
          "type": "text",
        },
        {
          "id": "test-id",
          "sourceType": "url",
          "title": "Best Italian Restaurant",
          "type": "source",
          "url": "https://maps.google.com/maps?cid=12345",
        },
        {
          "id": "test-id",
          "sourceType": "url",
          "title": undefined,
          "type": "source",
          "url": "https://maps.google.com/maps?cid=67890",
        },
      ]
    `);
  });

  it('should handle mixed source types with correct title defaults', async () => {
    prepareJsonResponse({
      content: 'test response with mixed sources',
      groundingMetadata: {
        groundingChunks: [
          {
            web: { uri: 'https://web.example.com' },
          },
          {
            retrievedContext: {
              uri: 'https://external.example.com',
            },
          },
          {
            retrievedContext: {
              uri: 'gs://bucket/document.pdf',
            },
          },
          {
            retrievedContext: {
              fileSearchStore: 'fileSearchStores/store-123',
            },
          },
        ],
      },
    });

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": undefined,
              "text": "test response with mixed sources",
              "type": "text",
            },
            {
              "id": "test-id",
              "sourceType": "url",
              "title": undefined,
              "type": "source",
              "url": "https://web.example.com",
            },
            {
              "id": "test-id",
              "sourceType": "url",
              "title": undefined,
              "type": "source",
              "url": "https://external.example.com",
            },
            {
              "filename": "document.pdf",
              "id": "test-id",
              "mediaType": "application/pdf",
              "sourceType": "document",
              "title": "Unknown Document",
              "type": "source",
            },
            {
              "filename": "store-123",
              "id": "test-id",
              "mediaType": "application/octet-stream",
              "sourceType": "document",
              "title": "Unknown Document",
              "type": "source",
            },
          ]
        `);
  });

  describe('async headers handling', () => {
    it('merges async config headers with sync request headers', async () => {
      server.urls[TEST_URL_GEMINI_PRO].response = {
        type: 'json-value',
        body: {
          candidates: [
            {
              content: {
                parts: [{ text: '' }],
                role: 'model',
              },
              finishReason: 'STOP',
              index: 0,
              safetyRatings: SAFETY_RATINGS,
            },
          ],
          promptFeedback: { safetyRatings: SAFETY_RATINGS },
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 2,
            totalTokenCount: 3,
          },
        },
      };

      const model = new GoogleGenerativeAILanguageModel('gemini-pro', {
        provider: 'google.generative-ai',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: async () => ({
          'X-Async-Config': 'async-config-value',
          'X-Common': 'config-value',
        }),
        generateId: () => 'test-id',
        supportedUrls: () => ({
          '*': [/^https?:\/\/.*$/],
        }),
      });

      await model.doGenerate({
        prompt: TEST_PROMPT,
        headers: {
          'X-Sync-Request': 'sync-request-value',
          'X-Common': 'request-value', // Should override config value
        },
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'x-async-config': 'async-config-value',
        'x-sync-request': 'sync-request-value',
        'x-common': 'request-value', // Request headers take precedence
      });
    });

    it('handles Promise-based headers', async () => {
      server.urls[TEST_URL_GEMINI_PRO].response = {
        type: 'json-value',
        body: {
          candidates: [
            {
              content: {
                parts: [{ text: '' }],
                role: 'model',
              },
              finishReason: 'STOP',
              index: 0,
              safetyRatings: SAFETY_RATINGS,
            },
          ],
          promptFeedback: { safetyRatings: SAFETY_RATINGS },
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 2,
            totalTokenCount: 3,
          },
        },
      };

      const model = new GoogleGenerativeAILanguageModel('gemini-pro', {
        provider: 'google.generative-ai',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: async () => ({
          'X-Promise-Header': 'promise-value',
        }),
        generateId: () => 'test-id',
      });

      await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'x-promise-header': 'promise-value',
      });
    });

    it('handles async function headers from config', async () => {
      prepareJsonResponse({});
      const model = new GoogleGenerativeAILanguageModel('gemini-pro', {
        provider: 'google.generative-ai',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: async () => ({
          'X-Async-Header': 'async-value',
        }),
        generateId: () => 'test-id',
      });

      await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'x-async-header': 'async-value',
      });
    });
  });

  it('should expose safety ratings in provider metadata', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: {
              parts: [{ text: 'test response' }],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: [
              {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                probability: 'NEGLIGIBLE',
                probabilityScore: 0.1,
                severity: 'LOW',
                severityScore: 0.2,
                blocked: false,
              },
            ],
          },
        ],
        promptFeedback: { safetyRatings: SAFETY_RATINGS },
      },
    };

    const { providerMetadata } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(providerMetadata?.google.safetyRatings).toStrictEqual([
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        probability: 'NEGLIGIBLE',
        probabilityScore: 0.1,
        severity: 'LOW',
        severityScore: 0.2,
        blocked: false,
      },
    ]);
  });

  it('should expose PromptFeedback in provider metadata', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: { parts: [{ text: 'No' }], role: 'model' },
            finishReason: 'SAFETY',
            index: 0,
            safetyRatings: SAFETY_RATINGS,
          },
        ],
        promptFeedback: {
          blockReason: 'SAFETY',
          safetyRatings: SAFETY_RATINGS,
        },
      },
    };

    const { providerMetadata } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(providerMetadata?.google.promptFeedback).toStrictEqual({
      blockReason: 'SAFETY',
      safetyRatings: SAFETY_RATINGS,
    });
  });

  it('should expose grounding metadata in provider metadata', async () => {
    prepareJsonResponse({
      content: 'test response',
      groundingMetadata: {
        webSearchQueries: ["What's the weather in Chicago this weekend?"],
        searchEntryPoint: {
          renderedContent: 'Sample rendered content for search results',
        },
        groundingChunks: [
          {
            web: {
              uri: 'https://example.com/weather',
              title: 'Chicago Weather Forecast',
            },
          },
        ],
        groundingSupports: [
          {
            segment: {
              startIndex: 0,
              endIndex: 65,
              text: 'Chicago weather changes rapidly, so layers let you adjust easily.',
            },
            groundingChunkIndices: [0],
            confidenceScores: [0.99],
          },
        ],
        retrievalMetadata: {
          webDynamicRetrievalScore: 0.96879,
        },
      },
    });

    const { providerMetadata } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(providerMetadata?.google.groundingMetadata).toStrictEqual({
      webSearchQueries: ["What's the weather in Chicago this weekend?"],
      searchEntryPoint: {
        renderedContent: 'Sample rendered content for search results',
      },
      groundingChunks: [
        {
          web: {
            uri: 'https://example.com/weather',
            title: 'Chicago Weather Forecast',
          },
        },
      ],
      groundingSupports: [
        {
          segment: {
            startIndex: 0,
            endIndex: 65,
            text: 'Chicago weather changes rapidly, so layers let you adjust easily.',
          },
          groundingChunkIndices: [0],
          confidenceScores: [0.99],
        },
      ],
      retrievalMetadata: {
        webDynamicRetrievalScore: 0.96879,
      },
    });
  });

  it('should handle code execution tool calls', async () => {
    server.urls[TEST_URL_GEMINI_2_0_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: {
              parts: [
                {
                  executableCode: {
                    language: 'PYTHON',
                    code: 'print(1+1)',
                  },
                },
                {
                  codeExecutionResult: {
                    outcome: 'OUTCOME_OK',
                    output: '2',
                  },
                },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
          },
        ],
      },
    };

    const model = provider.languageModel('gemini-2.0-pro');
    const { content } = await model.doGenerate({
      tools: [
        {
          type: 'provider',
          id: 'google.code_execution',
          name: 'code_execution',
          args: {},
        },
      ],
      prompt: TEST_PROMPT,
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.tools).toEqual([{ codeExecution: {} }]);

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "input": "{"language":"PYTHON","code":"print(1+1)"}",
          "providerExecuted": true,
          "toolCallId": "test-id",
          "toolName": "code_execution",
          "type": "tool-call",
        },
        {
          "result": {
            "outcome": "OUTCOME_OK",
            "output": "2",
          },
          "toolCallId": "test-id",
          "toolName": "code_execution",
          "type": "tool-result",
        },
      ]
    `);
  });

  describe('search tool selection', () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      generateId: () => 'test-id',
    });

    it('should use googleSearch for gemini-2.0-pro', async () => {
      prepareJsonResponse({
        url: TEST_URL_GEMINI_2_0_PRO,
      });

      const gemini2Pro = provider.languageModel('gemini-2.0-pro');
      await gemini2Pro.doGenerate({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'provider',
            id: 'google.google_search',
            name: 'google_search',
            args: {},
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        tools: [{ googleSearch: {} }],
      });
    });

    it('should use googleSearch for gemini-2.0-flash-exp', async () => {
      prepareJsonResponse({
        url: TEST_URL_GEMINI_2_0_FLASH_EXP,
      });

      const gemini2Flash = provider.languageModel('gemini-2.0-flash-exp');
      await gemini2Flash.doGenerate({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'provider',
            id: 'google.google_search',
            name: 'google_search',
            args: {},
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        tools: [{ googleSearch: {} }],
      });
    });

    it('should use googleSearchRetrieval for non-gemini-2 models', async () => {
      prepareJsonResponse({
        url: TEST_URL_GEMINI_1_0_PRO,
      });

      const geminiPro = provider.languageModel('gemini-1.0-pro');
      await geminiPro.doGenerate({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'provider',
            id: 'google.google_search',
            name: 'google_search',
            args: {},
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        tools: [{ googleSearchRetrieval: {} }],
      });
    });

    it('should use dynamic retrieval for gemini-1-5', async () => {
      prepareJsonResponse({
        url: TEST_URL_GEMINI_1_5_FLASH,
      });

      const geminiPro = provider.languageModel('gemini-1.5-flash');

      await geminiPro.doGenerate({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'provider',
            id: 'google.google_search',
            name: 'google_search',
            args: {
              mode: 'MODE_DYNAMIC',
              dynamicThreshold: 1,
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        tools: [
          {
            googleSearchRetrieval: {
              dynamicRetrievalConfig: {
                mode: 'MODE_DYNAMIC',
                dynamicThreshold: 1,
              },
            },
          },
        ],
      });
    });
    it('should use urlContextTool for gemini-2.0-pro', async () => {
      prepareJsonResponse({
        url: TEST_URL_GEMINI_2_0_PRO,
      });

      const gemini2Pro = provider.languageModel('gemini-2.0-pro');
      await gemini2Pro.doGenerate({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'provider',
            id: 'google.url_context',
            name: 'url_context',
            args: {},
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        tools: [{ urlContext: {} }],
      });
    });
    it('should use vertexRagStore for gemini-2.0-pro', async () => {
      prepareJsonResponse({
        url: TEST_URL_GEMINI_2_0_PRO,
      });

      const gemini2Pro = provider.languageModel('gemini-2.0-pro');
      await gemini2Pro.doGenerate({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'provider',
            id: 'google.vertex_rag_store',
            name: 'vertex_rag_store',
            args: {
              ragCorpus:
                'projects/my-project/locations/us-central1/ragCorpora/my-rag-corpus',
              topK: 5,
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        tools: [
          {
            retrieval: {
              vertex_rag_store: {
                rag_resources: {
                  rag_corpus:
                    'projects/my-project/locations/us-central1/ragCorpora/my-rag-corpus',
                },
                similarity_top_k: 5,
              },
            },
          },
        ],
      });
    });
  });

  it('should extract image file outputs', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Here is an image:' },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: 'base64encodedimagedata',
                  },
                },
                { text: 'And another image:' },
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: 'anotherbase64encodedimagedata',
                  },
                },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: SAFETY_RATINGS,
          },
        ],
        promptFeedback: { safetyRatings: SAFETY_RATINGS },
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      },
    };

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "providerMetadata": undefined,
          "text": "Here is an image:",
          "type": "text",
        },
        {
          "data": "base64encodedimagedata",
          "mediaType": "image/jpeg",
          "providerMetadata": undefined,
          "type": "file",
        },
        {
          "providerMetadata": undefined,
          "text": "And another image:",
          "type": "text",
        },
        {
          "data": "anotherbase64encodedimagedata",
          "mediaType": "image/png",
          "providerMetadata": undefined,
          "type": "file",
        },
      ]
    `);
  });

  it('should handle responses with only images and no text', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: 'imagedata1',
                  },
                },
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: 'imagedata2',
                  },
                },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: SAFETY_RATINGS,
          },
        ],
        promptFeedback: { safetyRatings: SAFETY_RATINGS },
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      },
    };

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "data": "imagedata1",
          "mediaType": "image/jpeg",
          "providerMetadata": undefined,
          "type": "file",
        },
        {
          "data": "imagedata2",
          "mediaType": "image/png",
          "providerMetadata": undefined,
          "type": "file",
        },
      ]
    `);
  });

  it('should pass responseModalities in provider options', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        google: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });
  });

  it('should pass mediaResolution in provider options', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        google: {
          mediaResolution: 'MEDIA_RESOLUTION_LOW',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      generationConfig: {
        mediaResolution: 'MEDIA_RESOLUTION_LOW',
      },
    });
  });

  it('should pass imageConfig.aspectRatio in provider options', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        google: {
          imageConfig: {
            aspectRatio: '16:9',
          },
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      generationConfig: {
        imageConfig: {
          aspectRatio: '16:9',
        },
      },
    });
  });

  it('should pass retrievalConfig in provider options', async () => {
    prepareJsonResponse({ url: TEST_URL_GEMINI_2_0_FLASH_EXP });

    const gemini2Model = provider.chat('gemini-2.0-flash-exp');

    await gemini2Model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider',
          id: 'google.google_maps',
          name: 'google_maps',
          args: {},
        },
      ],
      providerOptions: {
        google: {
          retrievalConfig: {
            latLng: {
              latitude: 34.090199,
              longitude: -117.881081,
            },
          },
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: 34.090199,
            longitude: -117.881081,
          },
        },
      },
    });
  });

  it('should include non-image inlineData parts', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Here is content:' },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: 'validimagedata',
                  },
                },
                {
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: 'pdfdata',
                  },
                },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: SAFETY_RATINGS,
          },
        ],
        promptFeedback: { safetyRatings: SAFETY_RATINGS },
      },
    };

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "providerMetadata": undefined,
          "text": "Here is content:",
          "type": "text",
        },
        {
          "data": "validimagedata",
          "mediaType": "image/jpeg",
          "providerMetadata": undefined,
          "type": "file",
        },
        {
          "data": "pdfdata",
          "mediaType": "application/pdf",
          "providerMetadata": undefined,
          "type": "file",
        },
      ]
    `);
  });
  it('should correctly parse and separate reasoning parts from text output', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Visible text part 1. ' },
                { text: 'This is a thought process.', thought: true },
                { text: 'Visible text part 2.' },
                { text: 'Another internal thought.', thought: true },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: SAFETY_RATINGS,
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      },
    };

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "providerMetadata": undefined,
          "text": "Visible text part 1. ",
          "type": "text",
        },
        {
          "providerMetadata": undefined,
          "text": "This is a thought process.",
          "type": "reasoning",
        },
        {
          "providerMetadata": undefined,
          "text": "Visible text part 2.",
          "type": "text",
        },
        {
          "providerMetadata": undefined,
          "text": "Another internal thought.",
          "type": "reasoning",
        },
      ]
    `);
  });

  it('should correctly parse thought signatures with reasoning parts', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Visible text part 1. ', thoughtSignature: 'sig1' },
                {
                  text: 'This is a thought process.',
                  thought: true,
                  thoughtSignature: 'sig2',
                },
                { text: 'Visible text part 2.', thoughtSignature: 'sig3' },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: SAFETY_RATINGS,
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      },
    };

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "providerMetadata": {
            "google": {
              "thoughtSignature": "sig1",
            },
          },
          "text": "Visible text part 1. ",
          "type": "text",
        },
        {
          "providerMetadata": {
            "google": {
              "thoughtSignature": "sig2",
            },
          },
          "text": "This is a thought process.",
          "type": "reasoning",
        },
        {
          "providerMetadata": {
            "google": {
              "thoughtSignature": "sig3",
            },
          },
          "text": "Visible text part 2.",
          "type": "text",
        },
      ]
    `);
  });

  it('should correctly parse thought signatures with function calls', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'test-tool',
                    args: { value: 'test' },
                  },
                  thoughtSignature: 'func_sig1',
                },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: SAFETY_RATINGS,
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      },
    };

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "input": "{"value":"test"}",
          "providerMetadata": {
            "google": {
              "thoughtSignature": "func_sig1",
            },
          },
          "toolCallId": "test-id",
          "toolName": "test-tool",
          "type": "tool-call",
        },
      ]
    `);
  });

  it('should support includeThoughts with google generative ai provider', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'let me think about this problem',
                  thought: true,
                  thoughtSignature: 'reasoning_sig',
                },
                { text: 'the answer is 42' },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
            safetyRatings: SAFETY_RATINGS,
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 15,
          totalTokenCount: 25,
          thoughtsTokenCount: 8,
        },
      },
    };

    const { content, usage } = await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        google: {
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: 1024,
          },
        },
      },
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "providerMetadata": {
            "google": {
              "thoughtSignature": "reasoning_sig",
            },
          },
          "text": "let me think about this problem",
          "type": "reasoning",
        },
        {
          "providerMetadata": undefined,
          "text": "the answer is 42",
          "type": "text",
        },
      ]
    `);

    expect(usage).toMatchInlineSnapshot(`
      {
        "inputTokens": {
          "cacheRead": 0,
          "cacheWrite": undefined,
          "noCache": 10,
          "total": 10,
        },
        "outputTokens": {
          "reasoning": 8,
          "text": 15,
          "total": 23,
        },
        "raw": {
          "candidatesTokenCount": 15,
          "promptTokenCount": 10,
          "thoughtsTokenCount": 8,
          "totalTokenCount": 25,
        },
      }
    `);
  });

  it('should pass thinkingLevel in provider options', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: 'high',
          },
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      generationConfig: {
        thinkingConfig: {
          thinkingLevel: 'high',
        },
      },
    });
  });

  it('should pass thinkingLevel "minimal" in provider options', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: 'minimal',
          },
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      generationConfig: {
        thinkingConfig: {
          thinkingLevel: 'minimal',
        },
      },
    });
  });

  it('should pass thinkingLevel "medium" in provider options', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: 'medium',
          },
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      generationConfig: {
        thinkingConfig: {
          thinkingLevel: 'medium',
        },
      },
    });
  });

  describe('providerMetadata key based on provider string', () => {
    it('should use "vertex" as providerMetadata key when provider includes "vertex"', async () => {
      server.urls[TEST_URL_GEMINI_PRO].response = {
        type: 'json-value',
        body: {
          candidates: [
            {
              content: { parts: [{ text: 'Hello!' }], role: 'model' },
              finishReason: 'STOP',
              safetyRatings: SAFETY_RATINGS,
              groundingMetadata: {
                webSearchQueries: ['test query'],
              },
            },
          ],
          promptFeedback: { safetyRatings: SAFETY_RATINGS },
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 2,
            totalTokenCount: 3,
          },
        },
      };

      const model = new GoogleGenerativeAILanguageModel('gemini-pro', {
        provider: 'google.vertex.chat',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: { 'x-goog-api-key': 'test-api-key' },
        generateId: () => 'test-id',
      });

      const { providerMetadata } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(providerMetadata).toHaveProperty('vertex');
      expect(providerMetadata).not.toHaveProperty('google');
      expect(providerMetadata?.vertex).toMatchObject({
        promptFeedback: expect.any(Object),
        groundingMetadata: expect.any(Object),
        safetyRatings: expect.any(Array),
      });
    });

    it('should use "google" as providerMetadata key when provider does not include "vertex"', async () => {
      server.urls[TEST_URL_GEMINI_PRO].response = {
        type: 'json-value',
        body: {
          candidates: [
            {
              content: { parts: [{ text: 'Hello!' }], role: 'model' },
              finishReason: 'STOP',
              safetyRatings: SAFETY_RATINGS,
              groundingMetadata: {
                webSearchQueries: ['test query'],
              },
            },
          ],
          promptFeedback: { safetyRatings: SAFETY_RATINGS },
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 2,
            totalTokenCount: 3,
          },
        },
      };

      const model = new GoogleGenerativeAILanguageModel('gemini-pro', {
        provider: 'google.generative-ai',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: { 'x-goog-api-key': 'test-api-key' },
        generateId: () => 'test-id',
        //should default to 'google'
      });

      const { providerMetadata } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(providerMetadata).toHaveProperty('google');
      expect(providerMetadata).not.toHaveProperty('vertex');
      expect(providerMetadata?.google).toMatchObject({
        promptFeedback: expect.any(Object),
        groundingMetadata: expect.any(Object),
        safetyRatings: expect.any(Array),
      });
    });

    it('should use "vertex" as providerMetadata key in thoughtSignature content when provider includes "vertex"', async () => {
      server.urls[TEST_URL_GEMINI_PRO].response = {
        type: 'json-value',
        body: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'thinking...',
                    thought: true,
                    thoughtSignature: 'sig123',
                  },
                  { text: 'Final answer' },
                ],
                role: 'model',
              },
              finishReason: 'STOP',
              safetyRatings: SAFETY_RATINGS,
            },
          ],
          promptFeedback: { safetyRatings: SAFETY_RATINGS },
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 2,
            totalTokenCount: 3,
          },
        },
      };

      const model = new GoogleGenerativeAILanguageModel('gemini-pro', {
        provider: 'google.vertex.chat',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: { 'x-goog-api-key': 'test-api-key' },
        generateId: () => 'test-id',
      });

      const { content } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      const reasoningPart = content.find(part => part.type === 'reasoning');
      expect(reasoningPart?.providerMetadata).toHaveProperty('vertex');
      expect(reasoningPart?.providerMetadata).not.toHaveProperty('google');
      expect(reasoningPart?.providerMetadata?.vertex).toMatchObject({
        thoughtSignature: 'sig123',
      });
    });

    it('should use "vertex" as providerMetadata key in tool call content when provider includes "vertex"', async () => {
      server.urls[TEST_URL_GEMINI_PRO].response = {
        type: 'json-value',
        body: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'test-tool',
                      args: { value: 'test' },
                    },
                    thoughtSignature: 'tool_sig',
                  },
                ],
                role: 'model',
              },
              finishReason: 'STOP',
              safetyRatings: SAFETY_RATINGS,
            },
          ],
          promptFeedback: { safetyRatings: SAFETY_RATINGS },
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 2,
            totalTokenCount: 3,
          },
        },
      };

      const model = new GoogleGenerativeAILanguageModel('gemini-pro', {
        provider: 'google.vertex.chat',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: { 'x-goog-api-key': 'test-api-key' },
        generateId: () => 'test-id',
      });

      const { content } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      const toolCallPart = content.find(part => part.type === 'tool-call');
      expect(toolCallPart?.providerMetadata).toHaveProperty('vertex');
      expect(toolCallPart?.providerMetadata).not.toHaveProperty('google');
      expect(toolCallPart?.providerMetadata?.vertex).toMatchObject({
        thoughtSignature: 'tool_sig',
      });
    });
  });
});

describe('doStream', () => {
  const TEST_URL_GEMINI_PRO =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent';

  const TEST_URL_GEMINI_2_0_PRO =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-pro:streamGenerateContent';

  const TEST_URL_GEMINI_2_0_FLASH_EXP =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent';

  const TEST_URL_GEMINI_1_0_PRO =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:streamGenerateContent';

  const TEST_URL_GEMINI_1_5_FLASH =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent';

  const server = createTestServer({
    [TEST_URL_GEMINI_PRO]: {},
    [TEST_URL_GEMINI_2_0_PRO]: {},
    [TEST_URL_GEMINI_2_0_FLASH_EXP]: {},
    [TEST_URL_GEMINI_1_0_PRO]: {},
    [TEST_URL_GEMINI_1_5_FLASH]: {},
  });

  const prepareStreamResponse = ({
    content,
    headers,
    groundingMetadata,
    urlContextMetadata,
    url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent',
  }: {
    content: string[];
    headers?: Record<string, string>;
    groundingMetadata?: GoogleGenerativeAIGroundingMetadata;
    urlContextMetadata?: GoogleGenerativeAIUrlContextMetadata;
    url?:
      | typeof TEST_URL_GEMINI_PRO
      | typeof TEST_URL_GEMINI_2_0_PRO
      | typeof TEST_URL_GEMINI_2_0_FLASH_EXP
      | typeof TEST_URL_GEMINI_1_0_PRO
      | typeof TEST_URL_GEMINI_1_5_FLASH;
  }) => {
    server.urls[url].response = {
      headers,
      type: 'stream-chunks',
      chunks: content.map(
        (text, index) =>
          `data: ${JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text }], role: 'model' },
                finishReason: 'STOP',
                index: 0,
                safetyRatings: SAFETY_RATINGS,
                ...(groundingMetadata && { groundingMetadata }),
                ...(urlContextMetadata && { urlContextMetadata }),
              },
            ],
            // Include usage metadata only in the last chunk
            ...(index === content.length - 1 && {
              usageMetadata: {
                promptTokenCount: 294,
                candidatesTokenCount: 233,
                totalTokenCount: 527,
              },
            }),
          })}\n\n`,
      ),
    };
  };

  it('should expose grounding metadata in provider metadata on finish', async () => {
    prepareStreamResponse({
      content: ['test'],
      groundingMetadata: {
        webSearchQueries: ["What's the weather in Chicago this weekend?"],
        searchEntryPoint: {
          renderedContent: 'Sample rendered content for search results',
        },
        groundingChunks: [
          {
            web: {
              uri: 'https://example.com/weather',
              title: 'Chicago Weather Forecast',
            },
          },
        ],
        groundingSupports: [
          {
            segment: {
              startIndex: 0,
              endIndex: 65,
              text: 'Chicago weather changes rapidly, so layers let you adjust easily.',
            },
            groundingChunkIndices: [0],
            confidenceScores: [0.99],
          },
        ],
        retrievalMetadata: {
          webDynamicRetrievalScore: 0.96879,
        },
      },
    });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const events = await convertReadableStreamToArray(stream);
    const finishEvent = events.find(event => event.type === 'finish');

    expect(
      finishEvent?.type === 'finish' &&
        finishEvent.providerMetadata?.google.groundingMetadata,
    ).toStrictEqual({
      webSearchQueries: ["What's the weather in Chicago this weekend?"],
      searchEntryPoint: {
        renderedContent: 'Sample rendered content for search results',
      },
      groundingChunks: [
        {
          web: {
            uri: 'https://example.com/weather',
            title: 'Chicago Weather Forecast',
          },
        },
      ],
      groundingSupports: [
        {
          segment: {
            startIndex: 0,
            endIndex: 65,
            text: 'Chicago weather changes rapidly, so layers let you adjust easily.',
          },
          groundingChunkIndices: [0],
          confidenceScores: [0.99],
        },
      ],
      retrievalMetadata: {
        webDynamicRetrievalScore: 0.96879,
      },
    });
  });

  it('should expose url context metadata in provider metadata on finish', async () => {
    prepareStreamResponse({
      content: ['test'],
      urlContextMetadata: {
        urlMetadata: [
          {
            retrievedUrl: 'https://example.com/weather',
            urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS',
          },
        ],
      },
    });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const events = await convertReadableStreamToArray(stream);
    const finishEvent = events.find(event => event.type === 'finish');

    expect(
      finishEvent?.type === 'finish' &&
        finishEvent.providerMetadata?.google.urlContextMetadata,
    ).toStrictEqual({
      urlMetadata: [
        {
          retrievedUrl: 'https://example.com/weather',
          urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS',
        },
      ],
    });
  });

  it('should stream text deltas', async () => {
    prepareStreamResponse({ content: ['Hello', ', ', 'world!'] });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "0",
          "providerMetadata": undefined,
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "0",
          "providerMetadata": undefined,
          "type": "text-delta",
        },
        {
          "delta": ", ",
          "id": "0",
          "providerMetadata": undefined,
          "type": "text-delta",
        },
        {
          "delta": "world!",
          "id": "0",
          "providerMetadata": undefined,
          "type": "text-delta",
        },
        {
          "id": "0",
          "type": "text-end",
        },
        {
          "finishReason": {
            "raw": "STOP",
            "unified": "stop",
          },
          "providerMetadata": {
            "google": {
              "groundingMetadata": null,
              "promptFeedback": null,
              "safetyRatings": [
                {
                  "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                  "probability": "NEGLIGIBLE",
                },
                {
                  "category": "HARM_CATEGORY_HATE_SPEECH",
                  "probability": "NEGLIGIBLE",
                },
                {
                  "category": "HARM_CATEGORY_HARASSMENT",
                  "probability": "NEGLIGIBLE",
                },
                {
                  "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                  "probability": "NEGLIGIBLE",
                },
              ],
              "urlContextMetadata": null,
              "usageMetadata": {
                "candidatesTokenCount": 233,
                "promptTokenCount": 294,
                "totalTokenCount": 527,
              },
            },
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": undefined,
              "noCache": 294,
              "total": 294,
            },
            "outputTokens": {
              "reasoning": 0,
              "text": 233,
              "total": 233,
            },
            "raw": {
              "candidatesTokenCount": 233,
              "promptTokenCount": 294,
              "totalTokenCount": 527,
            },
          },
        },
      ]
    `);
  });

  it('should expose safety ratings in provider metadata on finish', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"candidates": [{"content": {"parts": [{"text": "test"}],"role": "model"},` +
          `"finishReason": "STOP","index": 0,"safetyRatings": [` +
          `{"category": "HARM_CATEGORY_DANGEROUS_CONTENT","probability": "NEGLIGIBLE",` +
          `"probabilityScore": 0.1,"severity": "LOW","severityScore": 0.2,"blocked": false}]}]}\n\n`,
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const events = await convertReadableStreamToArray(stream);
    const finishEvent = events.find(event => event.type === 'finish');

    expect(
      finishEvent?.type === 'finish' &&
        finishEvent.providerMetadata?.google.safetyRatings,
    ).toStrictEqual([
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        probability: 'NEGLIGIBLE',
        probabilityScore: 0.1,
        severity: 'LOW',
        severityScore: 0.2,
        blocked: false,
      },
    ]);
  });

  it('should expose PromptFeedback in provider metadata on finish', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"candidates": [{"content": {"parts": [{"text": "No"}],"role": "model"},` +
          `"finishReason": "PROHIBITED_CONTENT","index": 0}],` +
          `"promptFeedback": {"blockReason": "PROHIBITED_CONTENT","safetyRatings": [` +
          `{"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT","probability": "NEGLIGIBLE"},` +
          `{"category": "HARM_CATEGORY_HATE_SPEECH","probability": "NEGLIGIBLE"},` +
          `{"category": "HARM_CATEGORY_HARASSMENT","probability": "NEGLIGIBLE"},` +
          `{"category": "HARM_CATEGORY_DANGEROUS_CONTENT","probability": "NEGLIGIBLE"}]}}\n\n`,
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    });

    const events = await convertReadableStreamToArray(stream);
    const finishEvent = events.find(event => event.type === 'finish');

    expect(
      finishEvent?.type === 'finish' &&
        finishEvent.providerMetadata?.google.promptFeedback,
    ).toStrictEqual({
      blockReason: 'PROHIBITED_CONTENT',
      safetyRatings: SAFETY_RATINGS,
    });
  });

  it('should stream code execution tool calls and results', async () => {
    server.urls[TEST_URL_GEMINI_2_0_PRO].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    executableCode: {
                      language: 'PYTHON',
                      code: 'print("hello")',
                    },
                  },
                ],
              },
            },
          ],
        })}\n\n`,
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    codeExecutionResult: {
                      outcome: 'OUTCOME_OK',
                      output: 'hello\n',
                    },
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        })}\n\n`,
      ],
    };

    const model = provider.languageModel('gemini-2.0-pro');
    const { stream } = await model.doStream({
      tools: [
        {
          type: 'provider',
          id: 'google.code_execution',
          name: 'code_execution',
          args: {},
        },
      ],
      prompt: TEST_PROMPT,
    });

    const events = await convertReadableStreamToArray(stream);

    const toolEvents = events.filter(
      e => e.type === 'tool-call' || e.type === 'tool-result',
    );

    expect(toolEvents).toMatchInlineSnapshot(`
      [
        {
          "input": "{"language":"PYTHON","code":"print(\\"hello\\")"}",
          "providerExecuted": true,
          "toolCallId": "test-id",
          "toolName": "code_execution",
          "type": "tool-call",
        },
        {
          "result": {
            "outcome": "OUTCOME_OK",
            "output": "hello
      ",
          },
          "toolCallId": "test-id",
          "toolName": "code_execution",
          "type": "tool-result",
        },
      ]
    `);
  });

  describe('search tool selection', () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      generateId: () => 'test-id',
    });

    it('should use googleSearch for gemini-2.0-pro', async () => {
      prepareStreamResponse({
        content: [''],
        url: TEST_URL_GEMINI_2_0_PRO,
      });

      const gemini2Pro = provider.languageModel('gemini-2.0-pro');
      await gemini2Pro.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
        tools: [
          {
            type: 'provider',
            id: 'google.google_search',
            name: 'google_search',
            args: {},
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        tools: [{ googleSearch: {} }],
      });
    });

    it('should use googleSearch for gemini-2.0-flash-exp', async () => {
      prepareStreamResponse({
        content: [''],
        url: TEST_URL_GEMINI_2_0_FLASH_EXP,
      });

      const gemini2Flash = provider.languageModel('gemini-2.0-flash-exp');

      await gemini2Flash.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
        tools: [
          {
            type: 'provider',
            id: 'google.google_search',
            name: 'google_search',
            args: {},
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        tools: [{ googleSearch: {} }],
      });
    });

    it('should use googleSearchRetrieval for non-gemini-2 models', async () => {
      prepareStreamResponse({
        content: [''],
        url: TEST_URL_GEMINI_1_0_PRO,
      });

      const geminiPro = provider.languageModel('gemini-1.0-pro');
      await geminiPro.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
        tools: [
          {
            type: 'provider',
            id: 'google.google_search',
            name: 'google_search',
            args: {},
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        tools: [{ googleSearchRetrieval: {} }],
      });
    });

    it('should use dynamic retrieval for gemini-1-5', async () => {
      prepareStreamResponse({
        content: [''],
        url: TEST_URL_GEMINI_1_5_FLASH,
      });

      const geminiPro = provider.languageModel('gemini-1.5-flash');

      await geminiPro.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
        tools: [
          {
            type: 'provider',
            id: 'google.google_search',
            name: 'google_search',
            args: {
              mode: 'MODE_DYNAMIC',
              dynamicThreshold: 1,
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        tools: [
          {
            googleSearchRetrieval: {
              dynamicRetrievalConfig: {
                mode: 'MODE_DYNAMIC',
                dynamicThreshold: 1,
              },
            },
          },
        ],
      });
    });
  });

  it('should stream source events', async () => {
    prepareStreamResponse({
      content: ['Some initial text'],
      groundingMetadata: {
        groundingChunks: [
          {
            web: {
              uri: 'https://source.example.com',
              title: 'Source Title',
            },
          },
        ],
      },
    });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const events = await convertReadableStreamToArray(stream);
    const sourceEvents = events.filter(event => event.type === 'source');

    expect(sourceEvents).toMatchInlineSnapshot(`
      [
        {
          "id": "test-id",
          "sourceType": "url",
          "title": "Source Title",
          "type": "source",
          "url": "https://source.example.com",
        },
      ]
    `);
  });

  it('should stream sources during intermediate chunks', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: 'text' }], role: 'model' },
              index: 0,
              safetyRatings: SAFETY_RATINGS,
              groundingMetadata: {
                groundingChunks: [
                  { web: { uri: 'https://a.com', title: 'A' } },
                  { web: { uri: 'https://b.com', title: 'B' } },
                ],
              },
            },
          ],
        })}\n\n`,
        `data: ${JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: 'more' }], role: 'model' },
              finishReason: 'STOP',
              index: 0,
              safetyRatings: SAFETY_RATINGS,
            },
          ],
        })}\n\n`,
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const events = await convertReadableStreamToArray(stream);
    const sourceEvents = events.filter(event => event.type === 'source');

    expect(sourceEvents).toMatchInlineSnapshot(`
      [
        {
          "id": "test-id",
          "sourceType": "url",
          "title": "A",
          "type": "source",
          "url": "https://a.com",
        },
        {
          "id": "test-id",
          "sourceType": "url",
          "title": "B",
          "type": "source",
          "url": "https://b.com",
        },
      ]
    `);
  });

  it('should deduplicate sources across chunks', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: 'first chunk' }], role: 'model' },
              index: 0,
              safetyRatings: SAFETY_RATINGS,
              groundingMetadata: {
                groundingChunks: [
                  { web: { uri: 'https://example.com', title: 'Example' } },
                  { web: { uri: 'https://unique.com', title: 'Unique' } },
                ],
              },
            },
          ],
        })}\n\n`,
        `data: ${JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: 'second chunk' }], role: 'model' },
              index: 0,
              safetyRatings: SAFETY_RATINGS,
              groundingMetadata: {
                groundingChunks: [
                  {
                    web: {
                      uri: 'https://example.com',
                      title: 'Example Duplicate',
                    },
                  },
                  { web: { uri: 'https://another.com', title: 'Another' } },
                ],
              },
            },
          ],
        })}\n\n`,
        `data: ${JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: 'final chunk' }], role: 'model' },
              finishReason: 'STOP',
              index: 0,
              safetyRatings: SAFETY_RATINGS,
            },
          ],
        })}\n\n`,
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const events = await convertReadableStreamToArray(stream);
    const sourceEvents = events.filter(event => event.type === 'source');

    expect(sourceEvents).toMatchInlineSnapshot(`
      [
        {
          "id": "test-id",
          "sourceType": "url",
          "title": "Example",
          "type": "source",
          "url": "https://example.com",
        },
        {
          "id": "test-id",
          "sourceType": "url",
          "title": "Unique",
          "type": "source",
          "url": "https://unique.com",
        },
        {
          "id": "test-id",
          "sourceType": "url",
          "title": "Another",
          "type": "source",
          "url": "https://another.com",
        },
      ]
    `);
  });

  it('should stream files', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"candidates": [{"content": {"parts": [{"inlineData": {"data": "test","mimeType": "text/plain"}}]` +
          `,"role": "model"},` +
          `"finishReason": "STOP","index": 0,"safetyRatings": [` +
          `{"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT","probability": "NEGLIGIBLE"},` +
          `{"category": "HARM_CATEGORY_HATE_SPEECH","probability": "NEGLIGIBLE"},` +
          `{"category": "HARM_CATEGORY_HARASSMENT","probability": "NEGLIGIBLE"},` +
          `{"category": "HARM_CATEGORY_DANGEROUS_CONTENT","probability": "NEGLIGIBLE"}]}]}\n\n`,
        `data: {"usageMetadata": {"promptTokenCount": 294,"candidatesTokenCount": 233,"totalTokenCount": 527}}\n\n`,
      ],
    };
    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const events = await convertReadableStreamToArray(stream);

    expect(events).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "data": "test",
          "mediaType": "text/plain",
          "type": "file",
        },
        {
          "finishReason": {
            "raw": "STOP",
            "unified": "stop",
          },
          "providerMetadata": {
            "google": {
              "groundingMetadata": null,
              "promptFeedback": null,
              "safetyRatings": [
                {
                  "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                  "probability": "NEGLIGIBLE",
                },
                {
                  "category": "HARM_CATEGORY_HATE_SPEECH",
                  "probability": "NEGLIGIBLE",
                },
                {
                  "category": "HARM_CATEGORY_HARASSMENT",
                  "probability": "NEGLIGIBLE",
                },
                {
                  "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                  "probability": "NEGLIGIBLE",
                },
              ],
              "urlContextMetadata": null,
            },
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": undefined,
              "noCache": 294,
              "total": 294,
            },
            "outputTokens": {
              "reasoning": 0,
              "text": 233,
              "total": 233,
            },
            "raw": {
              "candidatesTokenCount": 233,
              "promptTokenCount": 294,
              "totalTokenCount": 527,
            },
          },
        },
      ]
    `);
  });

  it('should stream text and files in correct order', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'Step 1: ' },
                  { inlineData: { data: 'image1', mimeType: 'image/png' } },
                  { text: ' Step 2: ' },
                  { inlineData: { data: 'image2', mimeType: 'image/jpeg' } },
                  { text: ' Done' },
                ],
                role: 'model',
              },
              finishReason: 'STOP',
              index: 0,
              safetyRatings: SAFETY_RATINGS,
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
          },
        })}\n\n`,
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const events = await convertReadableStreamToArray(stream);

    // Filter to content events only (excluding metadata)
    const contentEvents = events.filter(
      event =>
        event.type === 'text-start' ||
        event.type === 'text-delta' ||
        event.type === 'text-end' ||
        event.type === 'file',
    );

    // Verify that text and file parts are interleaved in the correct order
    expect(contentEvents).toMatchInlineSnapshot(`
      [
        {
          "id": "0",
          "providerMetadata": undefined,
          "type": "text-start",
        },
        {
          "delta": "Step 1: ",
          "id": "0",
          "providerMetadata": undefined,
          "type": "text-delta",
        },
        {
          "data": "image1",
          "mediaType": "image/png",
          "type": "file",
        },
        {
          "delta": " Step 2: ",
          "id": "0",
          "providerMetadata": undefined,
          "type": "text-delta",
        },
        {
          "data": "image2",
          "mediaType": "image/jpeg",
          "type": "file",
        },
        {
          "delta": " Done",
          "id": "0",
          "providerMetadata": undefined,
          "type": "text-delta",
        },
        {
          "id": "0",
          "type": "text-end",
        },
      ]
    `);
  });

  it('should set finishReason to tool-calls when chunk contains functionCall', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: 'Initial text response' }],
                role: 'model',
              },
              index: 0,
              safetyRatings: SAFETY_RATINGS,
            },
          ],
        })}\n\n`,
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'test-tool',
                      args: { value: 'example value' },
                    },
                  },
                ],
                role: 'model',
              },
              finishReason: 'STOP',
              index: 0,
              safetyRatings: SAFETY_RATINGS,
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
          },
        })}\n\n`,
      ],
    };
    const { stream } = await model.doStream({
      tools: [
        {
          type: 'function',
          name: 'test-tool',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      ],
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const events = await convertReadableStreamToArray(stream);
    const finishEvent = events.find(event => event.type === 'finish');

    expect(finishEvent?.finishReason).toMatchInlineSnapshot(`
      {
        "raw": "STOP",
        "unified": "tool-calls",
      }
    `);
  });

  it('should only pass valid provider options', async () => {
    prepareStreamResponse({ content: [''] });

    await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
      providerOptions: {
        google: { foo: 'bar', responseModalities: ['TEXT', 'IMAGE'] },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello' }],
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });
  });

  it('should stream reasoning parts separately from text parts', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'I need to think about this carefully. The user wants a simple explanation.',
                    thought: true,
                  },
                ],
                role: 'model',
              },
              index: 0,
            },
          ],
          usageMetadata: {
            promptTokenCount: 14,
            totalTokenCount: 84,
            thoughtsTokenCount: 70,
          },
        })}\n\n`,
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Let me organize my thoughts and provide a clear answer.',
                    thought: true,
                  },
                ],
                role: 'model',
              },
              index: 0,
            },
          ],
          usageMetadata: {
            promptTokenCount: 14,
            totalTokenCount: 156,
            thoughtsTokenCount: 142,
          },
        })}\n\n`,
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Here is a simple explanation: ',
                  },
                ],
                role: 'model',
              },
              index: 0,
            },
          ],
          usageMetadata: {
            promptTokenCount: 14,
            candidatesTokenCount: 8,
            totalTokenCount: 164,
            thoughtsTokenCount: 142,
          },
        })}\n\n`,
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'The concept works because of basic principles.',
                  },
                ],
                role: 'model',
              },
              finishReason: 'STOP',
              index: 0,
            },
          ],
          usageMetadata: {
            promptTokenCount: 14,
            candidatesTokenCount: 18,
            totalTokenCount: 174,
            thoughtsTokenCount: 142,
          },
        })}\n\n`,
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const allEvents = await convertReadableStreamToArray(stream);

    expect(allEvents).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "0",
          "providerMetadata": undefined,
          "type": "reasoning-start",
        },
        {
          "delta": "I need to think about this carefully. The user wants a simple explanation.",
          "id": "0",
          "providerMetadata": undefined,
          "type": "reasoning-delta",
        },
        {
          "delta": "Let me organize my thoughts and provide a clear answer.",
          "id": "0",
          "providerMetadata": undefined,
          "type": "reasoning-delta",
        },
        {
          "id": "0",
          "type": "reasoning-end",
        },
        {
          "id": "1",
          "providerMetadata": undefined,
          "type": "text-start",
        },
        {
          "delta": "Here is a simple explanation: ",
          "id": "1",
          "providerMetadata": undefined,
          "type": "text-delta",
        },
        {
          "delta": "The concept works because of basic principles.",
          "id": "1",
          "providerMetadata": undefined,
          "type": "text-delta",
        },
        {
          "id": "1",
          "type": "text-end",
        },
        {
          "finishReason": {
            "raw": "STOP",
            "unified": "stop",
          },
          "providerMetadata": {
            "google": {
              "groundingMetadata": null,
              "promptFeedback": null,
              "safetyRatings": null,
              "urlContextMetadata": null,
              "usageMetadata": {
                "candidatesTokenCount": 18,
                "promptTokenCount": 14,
                "thoughtsTokenCount": 142,
                "totalTokenCount": 174,
              },
            },
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": undefined,
              "noCache": 14,
              "total": 14,
            },
            "outputTokens": {
              "reasoning": 142,
              "text": 18,
              "total": 160,
            },
            "raw": {
              "candidatesTokenCount": 18,
              "promptTokenCount": 14,
              "thoughtsTokenCount": 142,
              "totalTokenCount": 174,
            },
          },
        },
      ]
    `);
  });

  it('should stream thought signatures with reasoning and text parts', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'I need to think about this.',
                    thought: true,
                    thoughtSignature: 'reasoning_sig1',
                  },
                ],
                role: 'model',
              },
              index: 0,
            },
          ],
        })}\n\n`,
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Here is the answer.',
                    thoughtSignature: 'text_sig1',
                  },
                ],
                role: 'model',
              },
              index: 0,
              finishReason: 'STOP',
              safetyRatings: SAFETY_RATINGS,
            },
          ],
        })}\n\n`,
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    });

    const chunks = await convertReadableStreamToArray(stream);

    expect(chunks).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "0",
          "providerMetadata": {
            "google": {
              "thoughtSignature": "reasoning_sig1",
            },
          },
          "type": "reasoning-start",
        },
        {
          "delta": "I need to think about this.",
          "id": "0",
          "providerMetadata": {
            "google": {
              "thoughtSignature": "reasoning_sig1",
            },
          },
          "type": "reasoning-delta",
        },
        {
          "id": "0",
          "type": "reasoning-end",
        },
        {
          "id": "1",
          "providerMetadata": {
            "google": {
              "thoughtSignature": "text_sig1",
            },
          },
          "type": "text-start",
        },
        {
          "delta": "Here is the answer.",
          "id": "1",
          "providerMetadata": {
            "google": {
              "thoughtSignature": "text_sig1",
            },
          },
          "type": "text-delta",
        },
        {
          "id": "1",
          "type": "text-end",
        },
        {
          "finishReason": {
            "raw": "STOP",
            "unified": "stop",
          },
          "providerMetadata": {
            "google": {
              "groundingMetadata": null,
              "promptFeedback": null,
              "safetyRatings": [
                {
                  "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                  "probability": "NEGLIGIBLE",
                },
                {
                  "category": "HARM_CATEGORY_HATE_SPEECH",
                  "probability": "NEGLIGIBLE",
                },
                {
                  "category": "HARM_CATEGORY_HARASSMENT",
                  "probability": "NEGLIGIBLE",
                },
                {
                  "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                  "probability": "NEGLIGIBLE",
                },
              ],
              "urlContextMetadata": null,
            },
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": undefined,
              "total": undefined,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": undefined,
              "total": undefined,
            },
            "raw": undefined,
          },
        },
      ]
    `);
  });

  describe('raw chunks', () => {
    it('should include raw chunks when includeRawChunks is enabled', async () => {
      prepareStreamResponse({
        content: ['Hello', ' World!'],
      });

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: true,
      });

      const chunks = await convertReadableStreamToArray(stream);

      expect(chunks.filter(chunk => chunk.type === 'raw'))
        .toMatchInlineSnapshot(`
        [
          {
            "rawValue": {
              "candidates": [
                {
                  "content": {
                    "parts": [
                      {
                        "text": "Hello",
                      },
                    ],
                    "role": "model",
                  },
                  "finishReason": "STOP",
                  "index": 0,
                  "safetyRatings": [
                    {
                      "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                      "probability": "NEGLIGIBLE",
                    },
                    {
                      "category": "HARM_CATEGORY_HATE_SPEECH",
                      "probability": "NEGLIGIBLE",
                    },
                    {
                      "category": "HARM_CATEGORY_HARASSMENT",
                      "probability": "NEGLIGIBLE",
                    },
                    {
                      "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                      "probability": "NEGLIGIBLE",
                    },
                  ],
                },
              ],
            },
            "type": "raw",
          },
          {
            "rawValue": {
              "candidates": [
                {
                  "content": {
                    "parts": [
                      {
                        "text": " World!",
                      },
                    ],
                    "role": "model",
                  },
                  "finishReason": "STOP",
                  "index": 0,
                  "safetyRatings": [
                    {
                      "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                      "probability": "NEGLIGIBLE",
                    },
                    {
                      "category": "HARM_CATEGORY_HATE_SPEECH",
                      "probability": "NEGLIGIBLE",
                    },
                    {
                      "category": "HARM_CATEGORY_HARASSMENT",
                      "probability": "NEGLIGIBLE",
                    },
                    {
                      "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                      "probability": "NEGLIGIBLE",
                    },
                  ],
                },
              ],
              "usageMetadata": {
                "candidatesTokenCount": 233,
                "promptTokenCount": 294,
                "totalTokenCount": 527,
              },
            },
            "type": "raw",
          },
        ]
      `);
    });

    it('should not include raw chunks when includeRawChunks is false', async () => {
      prepareStreamResponse({
        content: ['Hello', ' World!'],
      });

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      const chunks = await convertReadableStreamToArray(stream);

      expect(chunks.filter(chunk => chunk.type === 'raw')).toHaveLength(0);
    });
  });

  describe('providerMetadata key based on provider string', () => {
    it('should use "vertex" as providerMetadata key in finish event when provider includes "vertex"', async () => {
      server.urls[TEST_URL_GEMINI_PRO].response = {
        type: 'stream-chunks',
        chunks: [
          `data: ${JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: 'Hello' }], role: 'model' },
              },
            ],
          })}\n\n`,
          `data: ${JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: ' World!' }], role: 'model' },
                finishReason: 'STOP',
                safetyRatings: SAFETY_RATINGS,
                groundingMetadata: {
                  webSearchQueries: ['test query'],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 1,
              candidatesTokenCount: 2,
              totalTokenCount: 3,
            },
          })}\n\n`,
        ],
      };

      const model = new GoogleGenerativeAILanguageModel('gemini-pro', {
        provider: 'google.vertex.chat',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: { 'x-goog-api-key': 'test-api-key' },
        generateId: () => 'test-id',
      });

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
      });

      const events = await convertReadableStreamToArray(stream);
      const finishEvent = events.find(event => event.type === 'finish');

      expect(finishEvent?.type === 'finish').toBe(true);
      if (finishEvent?.type === 'finish') {
        expect(finishEvent.providerMetadata).toHaveProperty('vertex');
        expect(finishEvent.providerMetadata?.vertex).toMatchObject({
          promptFeedback: null,
          groundingMetadata: expect.any(Object),
          safetyRatings: expect.any(Array),
        });
      }
    });

    it('should use "google" as providerMetadata key in finish event when provider does not include "vertex"', async () => {
      server.urls[TEST_URL_GEMINI_PRO].response = {
        type: 'stream-chunks',
        chunks: [
          `data: ${JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: 'Hello' }], role: 'model' },
              },
            ],
          })}\n\n`,
          `data: ${JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: ' World!' }], role: 'model' },
                finishReason: 'STOP',
                safetyRatings: SAFETY_RATINGS,
                groundingMetadata: {
                  webSearchQueries: ['test query'],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 1,
              candidatesTokenCount: 2,
              totalTokenCount: 3,
            },
          })}\n\n`,
        ],
      };

      const model = new GoogleGenerativeAILanguageModel('gemini-pro', {
        provider: 'google.generative-ai',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: { 'x-goog-api-key': 'test-api-key' },
        generateId: () => 'test-id',
      });

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
      });

      const events = await convertReadableStreamToArray(stream);
      const finishEvent = events.find(event => event.type === 'finish');

      expect(finishEvent?.type === 'finish').toBe(true);
      if (finishEvent?.type === 'finish') {
        expect(finishEvent.providerMetadata).toHaveProperty('google');
        expect(finishEvent.providerMetadata).not.toHaveProperty('vertex');
        expect(finishEvent.providerMetadata?.google).toMatchObject({
          promptFeedback: null,
          groundingMetadata: expect.any(Object),
          safetyRatings: expect.any(Array),
        });
      }
    });

    it('should use "vertex" as providerMetadata key in streaming reasoning events when provider includes "vertex"', async () => {
      server.urls[TEST_URL_GEMINI_PRO].response = {
        type: 'stream-chunks',
        chunks: [
          `data: ${JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: 'thinking...',
                      thought: true,
                      thoughtSignature: 'stream_sig',
                    },
                  ],
                  role: 'model',
                },
              },
            ],
          })}\n\n`,
          `data: ${JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: 'Final answer' }], role: 'model' },
                finishReason: 'STOP',
                safetyRatings: SAFETY_RATINGS,
              },
            ],
            usageMetadata: {
              promptTokenCount: 1,
              candidatesTokenCount: 2,
              totalTokenCount: 3,
            },
          })}\n\n`,
        ],
      };

      const model = new GoogleGenerativeAILanguageModel('gemini-pro', {
        provider: 'google.vertex.chat',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: { 'x-goog-api-key': 'test-api-key' },
        generateId: () => 'test-id',
      });

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
      });

      const events = await convertReadableStreamToArray(stream);

      const reasoningStartEvent = events.find(
        event => event.type === 'reasoning-start',
      );
      expect(reasoningStartEvent?.type === 'reasoning-start').toBe(true);
      if (reasoningStartEvent?.type === 'reasoning-start') {
        expect(reasoningStartEvent.providerMetadata).toHaveProperty('vertex');
        expect(reasoningStartEvent.providerMetadata).not.toHaveProperty(
          'google',
        );
        expect(reasoningStartEvent.providerMetadata?.vertex).toMatchObject({
          thoughtSignature: 'stream_sig',
        });
      }

      const reasoningDeltaEvent = events.find(
        event => event.type === 'reasoning-delta',
      );
      expect(reasoningDeltaEvent?.type === 'reasoning-delta').toBe(true);
      if (reasoningDeltaEvent?.type === 'reasoning-delta') {
        expect(reasoningDeltaEvent.providerMetadata).toHaveProperty('vertex');
        expect(reasoningDeltaEvent.providerMetadata).not.toHaveProperty(
          'google',
        );
      }
    });
  });
});

describe('GEMMA Model System Instruction Fix', () => {
  const TEST_PROMPT_WITH_SYSTEM: LanguageModelV3Prompt = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ];

  const TEST_URL_GEMMA_3_12B_IT =
    'https://generativelanguage.googleapis.com/v1beta/models/gemma-3-12b-it:generateContent';

  const TEST_URL_GEMMA_3_27B_IT =
    'https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent';

  const TEST_URL_GEMINI_PRO =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

  const server = createTestServer({
    [TEST_URL_GEMMA_3_12B_IT]: {},
    [TEST_URL_GEMMA_3_27B_IT]: {},
    [TEST_URL_GEMINI_PRO]: {},
  });

  it('should NOT send systemInstruction for GEMMA-3-12b-it model', async () => {
    server.urls[TEST_URL_GEMMA_3_12B_IT].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: { parts: [{ text: 'Hello!' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      },
    };

    const model = new GoogleGenerativeAILanguageModel('gemma-3-12b-it', {
      provider: 'google.generative-ai',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: { 'x-goog-api-key': 'test-api-key' },
      generateId: () => 'test-id',
    });

    await model.doGenerate({
      prompt: TEST_PROMPT_WITH_SYSTEM,
    });

    // Verify that systemInstruction was NOT sent for GEMMA model
    const lastCall = server.calls[server.calls.length - 1];
    const requestBody = await lastCall.requestBodyJson;

    expect(requestBody).not.toHaveProperty('systemInstruction');
  });

  it('should NOT send systemInstruction for GEMMA-3-27b-it model', async () => {
    server.urls[TEST_URL_GEMMA_3_27B_IT].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: { parts: [{ text: 'Hello!' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      },
    };

    const model = new GoogleGenerativeAILanguageModel('gemma-3-27b-it', {
      provider: 'google.generative-ai',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: { 'x-goog-api-key': 'test-api-key' },
      generateId: () => 'test-id',
    });

    await model.doGenerate({
      prompt: TEST_PROMPT_WITH_SYSTEM,
    });

    const lastCall = server.calls[server.calls.length - 1];
    const requestBody = await lastCall.requestBodyJson;

    expect(requestBody).not.toHaveProperty('systemInstruction');
  });

  it('should still send systemInstruction for Gemini models (regression test)', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: { parts: [{ text: 'Hello!' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      },
    };

    const model = new GoogleGenerativeAILanguageModel('gemini-pro', {
      provider: 'google.generative-ai',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: { 'x-goog-api-key': 'test-api-key' },
      generateId: () => 'test-id',
    });

    await model.doGenerate({
      prompt: TEST_PROMPT_WITH_SYSTEM,
    });

    const lastCall = server.calls[server.calls.length - 1];
    const requestBody = await lastCall.requestBodyJson;

    expect(requestBody).toHaveProperty('systemInstruction');
    expect(requestBody.systemInstruction).toEqual({
      parts: [{ text: 'You are a helpful assistant.' }],
    });
  });

  it('should NOT generate warning when GEMMA model is used without system instructions', async () => {
    server.urls[TEST_URL_GEMMA_3_12B_IT].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: { parts: [{ text: 'Hello!' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      },
    };

    const model = new GoogleGenerativeAILanguageModel('gemma-3-12b-it', {
      provider: 'google.generative-ai',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: { 'x-goog-api-key': 'test-api-key' },
      generateId: () => 'test-id',
    });

    const TEST_PROMPT_WITHOUT_SYSTEM: LanguageModelV3Prompt = [
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ];

    const { warnings } = await model.doGenerate({
      prompt: TEST_PROMPT_WITHOUT_SYSTEM,
    });

    expect(warnings).toHaveLength(0);
  });

  it('should NOT generate warning when Gemini model is used with system instructions', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: { parts: [{ text: 'Hello!' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      },
    };

    const model = new GoogleGenerativeAILanguageModel('gemini-pro', {
      provider: 'google.generative-ai',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: { 'x-goog-api-key': 'test-api-key' },
      generateId: () => 'test-id',
    });

    const { warnings } = await model.doGenerate({
      prompt: TEST_PROMPT_WITH_SYSTEM,
    });

    expect(warnings).toHaveLength(0);
  });

  it('should prepend system instruction to first user message for GEMMA models', async () => {
    server.urls[TEST_URL_GEMMA_3_12B_IT].response = {
      type: 'json-value',
      body: {
        candidates: [
          {
            content: { parts: [{ text: 'Hello!' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      },
    };

    const model = new GoogleGenerativeAILanguageModel('gemma-3-12b-it', {
      provider: 'google.generative-ai',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: { 'x-goog-api-key': 'test-api-key' },
      generateId: () => 'test-id',
    });

    await model.doGenerate({
      prompt: TEST_PROMPT_WITH_SYSTEM,
    });

    const lastCall = server.calls[server.calls.length - 1];
    const requestBody = await lastCall.requestBodyJson;

    expect(requestBody).toMatchInlineSnapshot(`
      {
        "contents": [
          {
            "parts": [
              {
                "text": "You are a helpful assistant.

      ",
              },
              {
                "text": "Hello",
              },
            ],
            "role": "user",
          },
        ],
        "generationConfig": {},
      }
    `);
  });
});
