import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import { convertStreamToArray } from '@ai-sdk/provider-utils/test';
import { FinishReason, GenerativeModel } from '@google-cloud/vertexai';
import { createGoogleVertex } from './google-vertex-provider';
import { MockVertexAI } from './mock-vertex-ai';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function createModel(options: {
  generateContent?: GenerativeModel['generateContent'];
  generateContentStream?: GenerativeModel['generateContentStream'];
}) {
  const mock = new MockVertexAI(options);

  const provider = createGoogleVertex({
    location: 'test-location',
    project: 'test-project',
    generateId: () => 'test-id',
    createVertexAI: ({ project, location }) =>
      mock.createVertexAI({ project, location }),
  });

  return provider('gemini-1.0-pro-002');
}

describe('doGenerate', () => {
  it('should extract text response', async () => {
    const model = createModel({
      generateContent: async () => ({
        response: {
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello, World!' }],
                role: 'model',
              },
              index: 0,
            },
          ],
        },
      }),
    });

    const { text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
  });
});

describe('doStream', () => {
  it('should stream text deltas', async () => {
    const model = createModel({
      generateContentStream: async () => ({
        response: Promise.resolve({}),
        stream: (async function* () {
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
                content: {
                  role: 'model',
                  parts: [
                    {
                      text: '',
                    },
                  ],
                },
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
        })(),
      }),
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
