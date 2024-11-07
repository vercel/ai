import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import {
  FinishReason,
  GenerateContentResponse,
  GenerativeModel,
  Part,
} from '@google-cloud/vertexai';
import { createVertex } from './google-vertex-provider';
import { MockVertexAI } from './mock-vertex-ai';
import { GoogleVertexSettings } from './google-vertex-settings';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function createModel(options: {
  generateContent?: GenerativeModel['generateContent'];
  generateContentStream?: () => AsyncGenerator<GenerateContentResponse>;
  modelId?: string;
  settings?: GoogleVertexSettings;
}) {
  const mock = new MockVertexAI(options);

  const provider = createVertex({
    location: 'test-location',
    project: 'test-project',
    generateId: () => 'test-id',
    createVertexAI: ({ project, location }) =>
      mock.createVertexAI({ project, location }),
  });

  return {
    model: provider(options.modelId ?? 'gemini-1.0-pro-002', options.settings),
    mockVertexAI: mock,
  };
}

describe('doGenerate', () => {
  function prepareResponse({
    text = '',
    finishReason = 'STOP' as FinishReason,
    usageMetadata = {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
    },
    parts,
  }: {
    text?: string;
    finishReason?: FinishReason;
    usageMetadata?: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    };
    parts?: Part[];
  }) {
    return async () => ({
      response: {
        candidates: [
          {
            content: {
              parts: parts ?? [{ text }],
              role: 'model',
            },
            index: 0,
            finishReason,
          },
        ],
        usageMetadata,
      },
    });
  }

  it('should extract text response', async () => {
    const { model } = createModel({
      generateContent: prepareResponse({
        text: 'Hello, World!',
      }),
    });

    const { text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
  });

  it('should extract usage', async () => {
    const { model } = createModel({
      generateContent: prepareResponse({
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 40,
          totalTokenCount: 52,
        },
      }),
    });

    const { usage } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(usage).toStrictEqual({
      promptTokens: 10,
      completionTokens: 40,
    });
  });

  it('should extract tool calls', async () => {
    const { model, mockVertexAI } = createModel({
      generateContent: prepareResponse({
        parts: [
          {
            functionCall: {
              name: 'test-tool',
              args: { value: 'example value' },
            },
          },
        ],
      }),
    });

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

    expect(mockVertexAI.lastModelParams).toStrictEqual({
      model: 'gemini-1.0-pro-002',
      generationConfig: {
        frequencyPenalty: undefined,
        maxOutputTokens: undefined,
        responseMimeType: undefined,
        responseSchema: undefined,
        temperature: undefined,
        topK: undefined,
        topP: undefined,
        stopSequences: undefined,
      },
      tools: [
        {
          functionDeclarations: [
            {
              description: '',
              name: 'test-tool',
              parameters: {
                properties: {
                  value: {
                    type: 'string',
                  },
                },
                required: ['value'],
                type: 'object',
              },
            },
          ],
        },
      ],
      toolConfig: undefined,
      safetySettings: undefined,
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

  it('should extract finish reason', async () => {
    const { model } = createModel({
      generateContent: prepareResponse({
        finishReason: 'MAX_TOKENS' as FinishReason,
      }),
    });

    const { finishReason } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(finishReason).toStrictEqual('length');
  });

  it('should send model id and settings', async () => {
    const { model, mockVertexAI } = createModel({
      modelId: 'test-model',
      settings: {
        safetySettings: [
          {
            category: 'HARM_CATEGORY_UNSPECIFIED',
            threshold: 'BLOCK_NONE',
          },
        ],
      },
      generateContent: prepareResponse({}),
    });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      temperature: 0.5,
      maxTokens: 100,
      topP: 0.9,
      topK: 0.1,
      stopSequences: ['abc', 'def'],
      frequencyPenalty: 0.15,
    });

    expect(mockVertexAI.lastModelParams).toStrictEqual({
      model: 'test-model',
      generationConfig: {
        maxOutputTokens: 100,
        responseMimeType: undefined,
        responseSchema: undefined,
        temperature: 0.5,
        topK: 0.1,
        topP: 0.9,
        frequencyPenalty: 0.15,
        stopSequences: ['abc', 'def'],
      },
      tools: undefined,
      toolConfig: undefined,
      safetySettings: [
        {
          category: 'HARM_CATEGORY_UNSPECIFIED',
          threshold: 'BLOCK_NONE',
        },
      ],
    });
  });

  it('should send search grounding tool', async () => {
    const { model, mockVertexAI } = createModel({
      modelId: 'test-model',
      settings: {
        useSearchGrounding: true,
      },
      generateContent: prepareResponse({}),
    });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(mockVertexAI.lastModelParams).toStrictEqual({
      model: 'test-model',
      generationConfig: {
        frequencyPenalty: undefined,
        maxOutputTokens: undefined,
        responseMimeType: undefined,
        responseSchema: undefined,
        stopSequences: undefined,
        temperature: undefined,
        topK: undefined,
        topP: undefined,
      },
      tools: [{ googleSearchRetrieval: {} }],
      toolConfig: undefined,
      safetySettings: undefined,
    });
  });

  it('should send the messages', async () => {
    const { model } = createModel({
      generateContent: async request => {
        expect(request).toStrictEqual({
          contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
          systemInstruction: {
            role: 'system',
            parts: [{ text: 'test system instruction' }],
          },
        });

        return {
          response: {
            candidates: [
              {
                content: {
                  parts: [{ text: 'Hello, World!' }],
                  role: 'model',
                },
                index: 0,
                finishReason: 'STOP' as FinishReason,
              },
            ],
            usageMetadata: {
              promptTokenCount: 0,
              candidatesTokenCount: 0,
              totalTokenCount: 0,
            },
          },
        };
      },
    });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: [
        { role: 'system', content: 'test system instruction' },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
    });
  });

  it('should pass specification in object-json mode with structuredOutputs = true (default)', async () => {
    const { model, mockVertexAI } = createModel({
      generateContent: prepareResponse({
        text: '{"property1":"value1","property2":"value2"}',
      }),
    });

    const result = await model.doGenerate({
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

    expect(mockVertexAI.lastModelParams).toStrictEqual({
      generationConfig: {
        frequencyPenalty: undefined,
        maxOutputTokens: undefined,
        responseMimeType: 'application/json',
        responseSchema: {
          properties: {
            property1: { type: 'string' },
            property2: { type: 'number' },
          },
          required: ['property1', 'property2'],
          type: 'object',
        },
        stopSequences: undefined,
        temperature: undefined,
        topK: undefined,
        topP: undefined,
      },
      model: 'gemini-1.0-pro-002',
      safetySettings: undefined,
    });

    expect(result.text).toStrictEqual(
      '{"property1":"value1","property2":"value2"}',
    );
  });

  it('should not pass specification in object-json mode with structuredOutputs = false', async () => {
    const { model, mockVertexAI } = createModel({
      generateContent: prepareResponse({
        text: '{"property1":"value1","property2":"value2"}',
      }),
      settings: {
        structuredOutputs: false,
      },
    });

    const result = await model.doGenerate({
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

    expect(mockVertexAI.lastModelParams).toStrictEqual({
      generationConfig: {
        frequencyPenalty: undefined,
        maxOutputTokens: undefined,
        responseMimeType: 'application/json',
        responseSchema: undefined,
        stopSequences: undefined,
        temperature: undefined,
        topK: undefined,
        topP: undefined,
      },
      model: 'gemini-1.0-pro-002',
      safetySettings: undefined,
    });

    expect(result.text).toStrictEqual(
      '{"property1":"value1","property2":"value2"}',
    );
  });

  it('should support object-tool mode', async () => {
    const { model, mockVertexAI } = createModel({
      generateContent: prepareResponse({
        parts: [
          {
            functionCall: {
              name: 'test-tool',
              args: { value: 'Spark' },
            },
          },
        ],
      }),
    });

    const result = await model.doGenerate({
      inputFormat: 'prompt',
      mode: {
        type: 'object-tool',
        tool: {
          type: 'function',
          name: 'test-tool',
          description: 'test description',
          parameters: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(mockVertexAI.lastModelParams).toStrictEqual({
      model: 'gemini-1.0-pro-002',
      generationConfig: {
        frequencyPenalty: undefined,
        maxOutputTokens: undefined,
        responseMimeType: undefined,
        responseSchema: undefined,
        temperature: undefined,
        topK: undefined,
        topP: undefined,
        stopSequences: undefined,
      },
      tools: [
        {
          functionDeclarations: [
            {
              description: 'test description',
              name: 'test-tool',
              parameters: {
                properties: {
                  value: {
                    type: 'string',
                  },
                },
                required: ['value'],
                type: 'object',
              },
            },
          ],
        },
      ],
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
      safetySettings: undefined,
    });

    expect(result.toolCalls).toStrictEqual([
      {
        args: '{"value":"Spark"}',
        toolCallId: 'test-id',
        toolCallType: 'function',
        toolName: 'test-tool',
      },
    ]);
  });

  it('should include grounding metadata when useSearchGrounding is enabled', async () => {
    const { model } = createModel({
      settings: {
        useSearchGrounding: true,
      },
      generateContent: prepareResponse({
        text: 'Response with grounding',
        parts: [{ text: 'Response with grounding' }],
        finishReason: 'STOP' as FinishReason,
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      }),
    });

    const mockGroundingMetadata = {
      webSearchQueries: ['test query'],
      webSearchResults: [
        {
          url: 'https://example.com',
          title: 'Example Result',
          snippet: 'Example snippet',
        },
      ],
    };

    // Override the prepareResponse to include groundingMetadata
    (model as any).config.vertexAI.getGenerativeModel = () =>
      ({
        generateContent: async () => ({
          response: {
            candidates: [
              {
                content: {
                  parts: [{ text: 'Response with grounding' }],
                  role: 'model',
                },
                index: 0,
                finishReason: 'STOP',
                groundingMetadata: mockGroundingMetadata,
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
            },
          },
        }),
      } as any);

    const result = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(result.providerMetadata).toStrictEqual({
      vertex: {
        groundingMetadata: mockGroundingMetadata,
      },
    });
  });
});

describe('doStream', () => {
  it('should stream text deltas', async () => {
    const { model } = createModel({
      generateContentStream: async function* () {
        yield {
          candidates: [
            {
              content: { parts: [{ text: 'Hello, ' }], role: 'model' },
              index: 0,
            },
          ],
        };
        yield {
          candidates: [
            {
              content: { parts: [{ text: 'World!' }], role: 'model' },
              index: 0,
            },
          ],
        };
        yield {
          candidates: [
            {
              content: { parts: [{ text: '' }], role: 'model' },
              finishReason: 'STOP' as FinishReason,
              index: 0,
            },
          ],
          usageMetadata: {
            promptTokenCount: 9,
            candidatesTokenCount: 403,
            totalTokenCount: 412,
          },
        };
      },
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello, ' },
      { type: 'text-delta', textDelta: 'World!' },
      { type: 'text-delta', textDelta: '' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 9, completionTokens: 403 },
        providerMetadata: undefined,
      },
    ]);
  });

  it('should include grounding metadata in stream when useSearchGrounding is enabled', async () => {
    const mockGroundingMetadata = {
      webSearchQueries: ['test query'],
      webSearchResults: [
        {
          url: 'https://example.com',
          title: 'Example Result',
          snippet: 'Example snippet',
        },
      ],
    };

    const { model } = createModel({
      settings: {
        useSearchGrounding: true,
      },
      generateContentStream: async function* () {
        yield {
          candidates: [
            {
              content: { parts: [{ text: 'Response ' }], role: 'model' },
              index: 0,
            },
          ],
        };
        yield {
          candidates: [
            {
              content: { parts: [{ text: 'with grounding' }], role: 'model' },
              index: 0,
              groundingMetadata: mockGroundingMetadata,
              finishReason: 'STOP' as FinishReason,
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
          },
        };
      },
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Response ' },
      { type: 'text-delta', textDelta: 'with grounding' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20 },
        providerMetadata: {
          vertex: {
            groundingMetadata: mockGroundingMetadata,
          },
        },
      },
    ]);
  });
});
