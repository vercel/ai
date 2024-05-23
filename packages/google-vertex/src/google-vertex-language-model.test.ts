import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import { createGoogleVertex } from './google-vertex-provider';
import { MockVertexAI } from './mock-vertex-ai';
import { GenerativeModel } from '@google-cloud/vertexai';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function createModel(options: {
  generateContent: GenerativeModel['generateContent'];
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
