import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import { convertStreamToArray } from '@ai-sdk/provider-utils/test';
import {
  FinishReason,
  GenerateContentResponse,
  GenerativeModel,
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
  }: {
    text?: string;
    finishReason?: FinishReason;
    usageMetadata?: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    };
  }) {
    return async () => ({
      response: {
        candidates: [
          {
            content: {
              parts: [{ text }],
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
        topK: 0.1,
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
    });

    expect(mockVertexAI.lastModelParams).toStrictEqual({
      model: 'test-model',
      generationConfig: {
        maxOutputTokens: 100,
        temperature: 0.5,
        topK: 0.1,
        topP: 0.9,
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

    expect(await convertStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello, ' },
      { type: 'text-delta', textDelta: 'World!' },
      { type: 'text-delta', textDelta: '' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 9, completionTokens: 403 },
      },
    ]);
  });
});
