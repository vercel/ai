import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
} from '@ai-sdk/provider-utils/test';
import {
  GoogleGenerativeAILanguageModel,
  groundingMetadataSchema,
} from './google-generative-ai-language-model';
import { GoogleGenerativeAIGroundingMetadata } from './google-generative-ai-prompt';
import { createGoogleGenerativeAI } from './google-provider';

const TEST_PROMPT: LanguageModelV1Prompt = [
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

describe('supportsUrl', () => {
  it('should use the isSupportedUrl function from config', () => {
    const customModel = new GoogleGenerativeAILanguageModel(
      'gemini-pro',
      {},
      {
        provider: 'google.generative-ai',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: {},
        generateId: () => 'test-id',
        isSupportedUrl: url => url.hostname === 'custom.example.com',
      },
    );

    expect(
      customModel.supportsUrl(new URL('https://custom.example.com/test')),
    ).toStrictEqual(true);

    expect(
      customModel.supportsUrl(new URL('https://other.example.com/test')),
    ).toStrictEqual(false);
  });
});

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

<<<<<<< HEAD
=======
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

  it('validates groundingChunks[].image', () => {
    const metadata = {
      imageSearchQueries: ['Super Bowl halftime show in space'],
      groundingChunks: [
        {
          image: {
            sourceUri: 'https://example.com/article',
            imageUri: 'https://example.com/image.jpg',
            title: 'Image Title',
            domain: 'example.com',
          },
        },
      ],
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates groundingChunks[].image with missing optional fields', () => {
    const metadata = {
      groundingChunks: [
        {
          image: {
            sourceUri: 'https://example.com/article',
            imageUri: 'https://example.com/image.jpg',
          },
        },
      ],
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

>>>>>>> 4dda2a363 (Backport: feat(google): add support for image search, replace obsolete google_search_retrieval implementation (#13070))
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

    const { text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(usage).toStrictEqual({
      promptTokens: 20,
      completionTokens: 5,
    });
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

    const { text, finishReason } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toBeUndefined();
    expect(finishReason).toStrictEqual('error');
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

    const { toolCalls, finishReason, text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            parameters: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
      },
      prompt: TEST_PROMPT,
    });

    expect(toolCalls).toStrictEqual([
      {
        toolCallId: 'test-id',
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"example value"}',
      },
    ]);
    expect(text).toStrictEqual(undefined);
    expect(finishReason).toStrictEqual('tool-calls');
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse({ headers: { 'test-header': 'test-value' } });

    const { rawResponse } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(rawResponse?.headers).toStrictEqual({
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: [
        { role: 'system', content: 'test system instruction' },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
      seed: 123,
      temperature: 0.5,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: [
        { role: 'system', content: 'test system instruction' },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
      seed: 123,
      temperature: 0.5,
      providerMetadata: {
        google: { foo: 'bar', responseModalities: ['TEXT', 'IMAGE'] },
      },
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
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
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            parameters: {
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
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      generationConfig: {},
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      tools: {
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
      toolConfig: {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: ['test-tool'],
        },
      },
    });
  });

  it('should set response mime type in object-json mode', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: {
        type: 'object-json',
        schema: {
          type: 'object',
          properties: { location: { type: 'string' } },
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
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

  it('should pass specification in object-json mode with structuredOutputs = true (default)', async () => {
    prepareJsonResponse({});

    await provider.languageModel('gemini-pro').doGenerate({
      inputFormat: 'prompt',
      mode: {
        type: 'object-json',
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

    expect(await server.calls[0].requestBody).toStrictEqual({
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

  it('should not pass specification in object-json mode with structuredOutputs = false', async () => {
    prepareJsonResponse({});

    await provider
      .languageModel('gemini-pro', { structuredOutputs: false })
      .doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'object-json',
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

    expect(await server.calls[0].requestBody).toStrictEqual({
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
  });

  it('should pass tool specification in object-tool mode', async () => {
    prepareJsonResponse({});

    await provider.languageModel('gemini-pro').doGenerate({
      inputFormat: 'prompt',
      mode: {
        type: 'object-tool',
        tool: {
          name: 'test-tool',
          type: 'function',
          parameters: {
            type: 'object',
            properties: {
              property1: { type: 'string' },
              property2: { type: 'number' },
            },
            required: ['property1', 'property2'],
            additionalProperties: false,
          },
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      generationConfig: {},
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
      tools: {
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
    });
  });

  it('should pass systemInstruction in object-tool mode', async () => {
    prepareJsonResponse({});

    await provider.languageModel('gemini-pro').doGenerate({
      inputFormat: 'prompt',
      mode: {
        type: 'object-tool',
        tool: {
          name: 'test-tool',
          type: 'function',
          parameters: {
            type: 'object',
            properties: {
              result: { type: 'string' },
            },
            required: ['result'],
            additionalProperties: false,
          },
        },
      },
      prompt: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
    });

    expect(await server.calls[0].requestBody).toMatchInlineSnapshot(`
      {
        "contents": [
          {
            "parts": [
              {
                "text": "Hello",
              },
            ],
            "role": "user",
          },
        ],
        "generationConfig": {},
        "systemInstruction": {
          "parts": [
            {
              "text": "You are a helpful assistant.",
            },
          ],
        },
        "toolConfig": {
          "functionCallingConfig": {
            "mode": "ANY",
          },
        },
        "tools": {
          "functionDeclarations": [
            {
              "description": "",
              "name": "test-tool",
              "parameters": {
                "properties": {
                  "result": {
                    "type": "string",
                  },
                },
                "required": [
                  "result",
                ],
                "type": "object",
              },
            },
          ],
        },
      }
    `);
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
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
  });

  it('should pass response format', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
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

    expect(await server.calls[0].requestBody).toStrictEqual({
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const requestBody = await server.calls[0].requestBody;
    expect(requestBody).toStrictEqual({
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
          {
            retrievedContext: {
              uri: 'https://not-a-source.example.com',
              title: 'Not a Source',
            },
          },
        ],
      },
    });

    const { sources } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(sources).toEqual([
      {
        id: 'test-id',
        sourceType: 'url',
        title: 'Source Title',
        url: 'https://source.example.com',
      },
<<<<<<< HEAD
    ]);
=======
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

  it('should extract sources from image grounding metadata', async () => {
    prepareJsonResponse({
      content: 'test response with image search',
      groundingMetadata: {
        groundingChunks: [
          {
            image: {
              sourceUri: 'https://example.com/article',
              imageUri: 'https://example.com/image.jpg',
              title: 'Image Result',
              domain: 'example.com',
            },
          },
          {
            image: {
              sourceUri: 'https://other.example.com/page',
              imageUri: 'https://other.example.com/photo.png',
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
          "text": "test response with image search",
          "type": "text",
        },
        {
          "id": "test-id",
          "sourceType": "url",
          "title": "Image Result",
          "type": "source",
          "url": "https://example.com/article",
        },
        {
          "id": "test-id",
          "sourceType": "url",
          "title": undefined,
          "type": "source",
          "url": "https://other.example.com/page",
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
>>>>>>> 4dda2a363 (Backport: feat(google): add support for image search, replace obsolete google_search_retrieval implementation (#13070))
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

      const model = new GoogleGenerativeAILanguageModel(
        'gemini-pro',
        {},
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: async () => ({
            'X-Async-Config': 'async-config-value',
            'X-Common': 'config-value',
          }),
          generateId: () => 'test-id',
          isSupportedUrl: () => true,
        },
      );

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
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

      const model = new GoogleGenerativeAILanguageModel(
        'gemini-pro',
        {},
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: async () => ({
            'X-Promise-Header': 'promise-value',
          }),
          generateId: () => 'test-id',
          isSupportedUrl: () => true,
        },
      );

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'x-promise-header': 'promise-value',
      });
    });

    it('handles async function headers from config', async () => {
      prepareJsonResponse({});
      const model = new GoogleGenerativeAILanguageModel(
        'gemini-pro',
        {},
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: async () => ({
            'X-Async-Header': 'async-value',
          }),
          generateId: () => 'test-id',
          isSupportedUrl: () => true,
        },
      );

      await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
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

  describe('search tool selection', () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      generateId: () => 'test-id',
    });

    it('should use googleSearch for gemini-2.0-pro', async () => {
      prepareJsonResponse({
        url: TEST_URL_GEMINI_2_0_PRO,
      });

      const gemini2Pro = provider.languageModel('gemini-2.0-pro', {
        useSearchGrounding: true,
      });
      await gemini2Pro.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBody).toMatchObject({
        tools: { googleSearch: {} },
      });
    });

    it('should use googleSearch for gemini-2.0-flash-exp', async () => {
      prepareJsonResponse({
        url: TEST_URL_GEMINI_2_0_FLASH_EXP,
      });

      const gemini2Flash = provider.languageModel('gemini-2.0-flash-exp', {
        useSearchGrounding: true,
      });
      await gemini2Flash.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBody).toMatchObject({
        tools: { googleSearch: {} },
      });
    });

    it('should warn for google search on non-gemini-2 models', async () => {
      prepareJsonResponse({
        url: TEST_URL_GEMINI_1_0_PRO,
      });

<<<<<<< HEAD
      const geminiPro = provider.languageModel('gemini-1.0-pro', {
        useSearchGrounding: true,
      });
      await geminiPro.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
=======
      const geminiPro = provider.languageModel('gemini-1.0-pro');
      const result = await geminiPro.doGenerate({
>>>>>>> 4dda2a363 (Backport: feat(google): add support for image search, replace obsolete google_search_retrieval implementation (#13070))
        prompt: TEST_PROMPT,
      });

<<<<<<< HEAD
      expect(await server.calls[0].requestBody).toMatchObject({
        tools: { googleSearchRetrieval: {} },
      });
    });

    it('should use dynamic retrieval for gemini-1-5', async () => {
      prepareJsonResponse({
        url: TEST_URL_GEMINI_1_5_FLASH,
      });

      const geminiPro = provider.languageModel('gemini-1.5-flash', {
        useSearchGrounding: true,
        dynamicRetrievalConfig: {
          mode: 'MODE_DYNAMIC',
          dynamicThreshold: 1,
        },
      });

      await geminiPro.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBody).toMatchObject({
        tools: {
          googleSearchRetrieval: {
            dynamicRetrievalConfig: {
              mode: 'MODE_DYNAMIC',
              dynamicThreshold: 1,
            },
          },
        },
=======
      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "details": "Google Search requires Gemini 2.0 or newer.",
            "tool": {
              "args": {},
              "id": "google.google_search",
              "name": "google_search",
              "type": "provider-defined",
            },
            "type": "unsupported-tool",
          },
        ]
      `);
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
            type: 'provider-defined',
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
            type: 'provider-defined',
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
>>>>>>> 4dda2a363 (Backport: feat(google): add support for image search, replace obsolete google_search_retrieval implementation (#13070))
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

    const { text, files } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Here is an image:And another image:');
    expect(files).toStrictEqual([
      {
        data: 'base64encodedimagedata',
        mimeType: 'image/jpeg',
      },
      {
        data: 'anotherbase64encodedimagedata',
        mimeType: 'image/png',
      },
    ]);
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

    const { text, files } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toBeUndefined();
    expect(files).toStrictEqual([
      {
        data: 'imagedata1',
        mimeType: 'image/jpeg',
      },
      {
        data: 'imagedata2',
        mimeType: 'image/png',
      },
    ]);
  });

  it('should pass responseModalities in provider options', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        google: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      },
    });

    expect(await server.calls[0].requestBody).toMatchObject({
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
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

    const { text, files } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Here is content:');
    expect(files).toStrictEqual([
      {
        data: 'validimagedata',
        mimeType: 'image/jpeg',
      },
      {
        data: 'pdfdata',
        mimeType: 'application/pdf',
      },
    ]);
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

    const { text, reasoning } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Visible text part 1. Visible text part 2.');
    expect(reasoning).toStrictEqual([
      { type: 'text', text: 'This is a thought process.' },
      { type: 'text', text: 'Another internal thought.' },
    ]);
  });
  describe('warnings for includeThoughts option', () => {
    it('should generate a warning if includeThoughts is true for a non-Vertex provider', async () => {
      prepareJsonResponse({ content: 'test' }); // Mock API response

      // Manually create a model instance to control the provider string
      const nonVertexModel = new GoogleGenerativeAILanguageModel(
        'gemini-pro',
        {},
        {
          provider: 'google.generative-ai.chat', // Simulate non-Vertex provider
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: {},
          generateId: () => 'test-id',
          isSupportedUrl: () => false, // Dummy implementation
        },
      );

      const { warnings } = await nonVertexModel.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        providerMetadata: {
          google: {
            thinkingConfig: {
              includeThoughts: true,
              thinkingBudget: 500,
            },
          },
        },
      });

      expect(warnings).toContainEqual({
        type: 'other',
        message:
          "The 'includeThoughts' option is only supported with the Google Vertex provider " +
          'and might not be supported or could behave unexpectedly with the current Google provider ' +
          '(google.generative-ai.chat).',
      });
    });

    it('should NOT generate a warning if includeThoughts is true for a Vertex provider', async () => {
      prepareJsonResponse({ content: 'test' }); // Mock API response

      const vertexModel = new GoogleGenerativeAILanguageModel(
        'gemini-pro',
        {},
        {
          provider: 'google.vertex.chat', // Simulate Vertex provider
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: {},
          generateId: () => 'test-id',
          isSupportedUrl: () => false,
        },
      );

      const { warnings } = await vertexModel.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        providerMetadata: {
          google: {
            thinkingConfig: {
              includeThoughts: true,
              thinkingBudget: 500,
            },
          },
        },
      });

      const expectedWarningMessage =
        "The 'includeThoughts' option is only supported with the Google Vertex provider " +
        'and might not be supported or could behave unexpectedly with the current Google provider ';

      expect(
        warnings?.some(
          w =>
            w.type === 'other' && w.message.startsWith(expectedWarningMessage),
        ),
      ).toBe(false);
    });

    it('should NOT generate a warning if includeThoughts is false for a non-Vertex provider', async () => {
      prepareJsonResponse({ content: 'test' }); // Mock API response

      const nonVertexModel = new GoogleGenerativeAILanguageModel(
        'gemini-pro',
        {},
        {
          provider: 'google.generative-ai.chat', // Simulate non-Vertex provider
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: {},
          generateId: () => 'test-id',
          isSupportedUrl: () => false,
        },
      );

      const { warnings } = await nonVertexModel.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        providerMetadata: {
          google: {
            thinkingConfig: {
              includeThoughts: false,
              thinkingBudget: 500,
            },
          },
        },
      });

      const expectedWarningMessage =
        "The 'includeThoughts' option is only supported with the Google Vertex provider " +
        'and might not be supported or could behave unexpectedly with the current Google provider ';
      expect(
        warnings?.some(
          w =>
            w.type === 'other' && w.message.startsWith(expectedWarningMessage),
        ),
      ).toBe(false);
    });

    it('should NOT generate a warning if thinkingConfig is not provided for a non-Vertex provider', async () => {
      prepareJsonResponse({ content: 'test' }); // Mock API response
      const nonVertexModel = new GoogleGenerativeAILanguageModel(
        'gemini-pro',
        {},
        {
          provider: 'google.generative-ai.chat', // Simulate non-Vertex provider
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: {},
          generateId: () => 'test-id',
          isSupportedUrl: () => false,
        },
      );

      const { warnings } = await nonVertexModel.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        providerMetadata: {
          google: {
            // No thinkingConfig
          },
        },
      });
      const expectedWarningMessage =
        "The 'includeThoughts' option is only supported with the Google Vertex provider " +
        'and might not be supported or could behave unexpectedly with the current Google provider ';
      expect(
        warnings?.some(
          w =>
            w.type === 'other' && w.message.startsWith(expectedWarningMessage),
        ),
      ).toBe(false);
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
    url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent',
  }: {
    content: string[];
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
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

  it('should stream text deltas', async () => {
    prepareStreamResponse({ content: ['Hello', ', ', 'world!'] });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'world!' },
      {
        type: 'finish',
        finishReason: 'stop',
        providerMetadata: {
          google: {
            groundingMetadata: null,
            safetyRatings: [
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
            ],
          },
        },
        usage: { promptTokens: 294, completionTokens: 233 },
      },
    ]);
  });

  it('should expose the raw response headers', async () => {
    prepareStreamResponse({
      content: [],
      headers: { 'test-header': 'test-value' },
    });

    const { rawResponse } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(rawResponse?.headers).toStrictEqual({
      // default headers:
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass the messages', async () => {
    prepareStreamResponse({ content: [''] });
    await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello' }],
        },
      ],
      generationConfig: {},
    });
  });

  it('should set streaming mode search param', async () => {
    prepareStreamResponse({ content: [''] });
    await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const searchParams = server.calls[0].requestUrlSearchParams;
    expect(searchParams.get('alt')).toStrictEqual('sse');
  });

  it('should pass headers', async () => {
    prepareStreamResponse({ content: [''] });
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.chat('gemini-pro').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toStrictEqual({
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      'x-goog-api-key': 'test-api-key',
    });
  });

  it('should send request body', async () => {
    prepareStreamResponse({ content: [''] });

    const { request } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      generationConfig: {},
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    });
  });

  it('should support empty candidates array', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"candidates": [{"content": {"parts": [{"text": "test"}],"role": "model"},` +
          `"finishReason": "STOP","index": 0,"safetyRatings": [` +
          `{"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT","probability": "NEGLIGIBLE"},` +
          `{"category": "HARM_CATEGORY_HATE_SPEECH","probability": "NEGLIGIBLE"},` +
          `{"category": "HARM_CATEGORY_HARASSMENT","probability": "NEGLIGIBLE"},` +
          `{"category": "HARM_CATEGORY_DANGEROUS_CONTENT","probability": "NEGLIGIBLE"}]}]}\n\n`,
        `data: {"usageMetadata": {"promptTokenCount": 294,"candidatesTokenCount": 233,"totalTokenCount": 527}}\n\n`,
      ],
    };

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'test' },
      {
        type: 'finish',
        finishReason: 'stop',
        providerMetadata: {
          google: {
            groundingMetadata: null,
            safetyRatings: [
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
            ],
          },
        },
        usage: { promptTokens: 294, completionTokens: 233 },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
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

      const gemini2Pro = provider.languageModel('gemini-2.0-pro', {
        useSearchGrounding: true,
      });
      await gemini2Pro.doStream({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBody).toMatchObject({
        tools: { googleSearch: {} },
      });
    });

    it('should use googleSearch for gemini-2.0-flash-exp', async () => {
      prepareStreamResponse({
        content: [''],
        url: TEST_URL_GEMINI_2_0_FLASH_EXP,
      });

      const gemini2Flash = provider.languageModel('gemini-2.0-flash-exp', {
        useSearchGrounding: true,
      });
      await gemini2Flash.doStream({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBody).toMatchObject({
        tools: { googleSearch: {} },
      });
    });

    it('should warn for google search on non-gemini-2 models', async () => {
      prepareStreamResponse({
        content: [''],
        url: TEST_URL_GEMINI_1_0_PRO,
      });

<<<<<<< HEAD
      const geminiPro = provider.languageModel('gemini-1.0-pro', {
        useSearchGrounding: true,
      });
      await geminiPro.doStream({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
=======
      const geminiPro = provider.languageModel('gemini-1.0-pro');
      const { stream } = await geminiPro.doStream({
>>>>>>> 4dda2a363 (Backport: feat(google): add support for image search, replace obsolete google_search_retrieval implementation (#13070))
        prompt: TEST_PROMPT,
      });

<<<<<<< HEAD
      expect(await server.calls[0].requestBody).toMatchObject({
        tools: { googleSearchRetrieval: {} },
      });
    });

    it('should use dynamic retrieval for gemini-1-5', async () => {
      prepareStreamResponse({
        content: [''],
        url: TEST_URL_GEMINI_1_5_FLASH,
      });

      const geminiPro = provider.languageModel('gemini-1.5-flash', {
        useSearchGrounding: true,
        dynamicRetrievalConfig: {
          mode: 'MODE_DYNAMIC',
          dynamicThreshold: 1,
        },
      });

      await geminiPro.doStream({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBody).toMatchObject({
        tools: {
          googleSearchRetrieval: {
            dynamicRetrievalConfig: {
              mode: 'MODE_DYNAMIC',
              dynamicThreshold: 1,
            },
          },
        },
      });
=======
      const events = await convertReadableStreamToArray(stream);

      expect(events[0]).toMatchInlineSnapshot(`
        {
          "type": "stream-start",
          "warnings": [
            {
              "details": "Google Search requires Gemini 2.0 or newer.",
              "tool": {
                "args": {},
                "id": "google.google_search",
                "name": "google_search",
                "type": "provider-defined",
              },
              "type": "unsupported-tool",
            },
          ],
        }
      `);
>>>>>>> 4dda2a363 (Backport: feat(google): add support for image search, replace obsolete google_search_retrieval implementation (#13070))
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const events = await convertReadableStreamToArray(stream);
    const sourceEvents = events.filter(event => event.type === 'source');

    expect(sourceEvents).toEqual([
      {
        type: 'source',
        source: {
          id: 'test-id',
          sourceType: 'url',
          title: 'Source Title',
          url: 'https://source.example.com',
        },
<<<<<<< HEAD
      },
    ]);
=======
      ]
    `);
  });

  it('should stream source events from image grounding metadata', async () => {
    prepareStreamResponse({
      content: ['image search response'],
      groundingMetadata: {
        groundingChunks: [
          {
            image: {
              sourceUri: 'https://example.com/article',
              imageUri: 'https://example.com/image.jpg',
              title: 'Image Source',
              domain: 'example.com',
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
          "title": "Image Source",
          "type": "source",
          "url": "https://example.com/article",
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
>>>>>>> 4dda2a363 (Backport: feat(google): add support for image search, replace obsolete google_search_retrieval implementation (#13070))
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const events = await convertReadableStreamToArray(stream);

    expect(events.filter(event => event.type === 'error')).toEqual([]); // no errors
    expect(events.filter(event => event.type === 'file')).toEqual([
      { type: 'file', mimeType: 'text/plain', data: 'test' },
    ]);
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
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            parameters: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
      },
      prompt: TEST_PROMPT,
    });

    const events = await convertReadableStreamToArray(stream);
    const finishEvent = events.find(event => event.type === 'finish');

    expect(finishEvent?.type === 'finish' && finishEvent.finishReason).toEqual(
      'tool-calls',
    );
  });

  it('should only pass valid provider options', async () => {
    prepareStreamResponse({ content: [''] });

    await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        google: { foo: 'bar', responseModalities: ['TEXT', 'IMAGE'] },
      },
    });

    expect(await server.calls[0].requestBody).toMatchObject({
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

  it('should correctly stream reasoning parts and text deltas separately', async () => {
    server.urls[TEST_URL_GEMINI_PRO].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: 'Text delta 1. ' }], role: 'model' },
              index: 0,
              safetyRatings: SAFETY_RATINGS,
            },
          ],
        })}\n\n`,
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: 'Reasoning delta 1.', thought: true }],
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
              content: { parts: [{ text: 'Text delta 2.' }], role: 'model' },
              index: 0,
              safetyRatings: SAFETY_RATINGS,
            },
          ],
        })}\n\n`,
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: 'Reasoning delta 2.', thought: true }],
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
                // currently ignored:
                parts: [{ thoughtSignature: 'test-signature', thought: true }],
                role: 'model',
              },
              finishReason: 'STOP', // Mark finish reason in a chunk that has content
              index: 0,
              safetyRatings: SAFETY_RATINGS,
            },
          ],
        })}\n\n`,
        `data: ${JSON.stringify({
          // Final chunk for usage metadata
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 25,
            totalTokenCount: 40,
          },
        })}\n\n`,
      ],
    };
    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const events = await convertReadableStreamToArray(stream);

    const relevantEvents = events.filter(
      event => event.type === 'text-delta' || event.type === 'reasoning',
    );

    expect(relevantEvents).toStrictEqual([
      { type: 'text-delta', textDelta: 'Text delta 1. ' },
      { type: 'reasoning', textDelta: 'Reasoning delta 1.' },
      { type: 'text-delta', textDelta: 'Text delta 2.' },
      { type: 'reasoning', textDelta: 'Reasoning delta 2.' },
    ]);

    const finishEvent = events.find(event => event.type === 'finish');
    expect(finishEvent).toBeDefined();
    expect(finishEvent?.type === 'finish' && finishEvent.finishReason).toEqual(
      'stop',
    );
    expect(finishEvent?.type === 'finish' && finishEvent.usage).toStrictEqual({
      promptTokens: 15,
      completionTokens: 25,
    });
  });
});
