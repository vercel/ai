import { expect, describe, it, beforeEach } from 'vitest';
import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  createTestServer,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createInflection } from './inflection-provider';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const INFERENCE_URL =
  'https://layercake.pubwestus3.inf7ks8.com/external/api/inference';
const STREAMING_URL = `${INFERENCE_URL}/streaming`;

/**
 * Test server for mocking API responses
 */
const server = createTestServer({
  [INFERENCE_URL]: {
    response: {
      type: 'json-value',
      body: {
        created: 1714688002.0557644,
        text: 'Hello there!',
      },
    },
  },
  [STREAMING_URL]: {
    response: {
      type: 'stream-chunks',
      chunks: [
        '{"created": 1728094708.2514212, "idx": 0, "text": "Hello"}',
        '{"created": 1728094708.5789802, "idx": 1, "text": " there"}',
        '{"created": 1728094708.7364252, "idx": 2, "text": "!"}',
      ],
    },
  },
});

beforeEach(() => {
  // Reset the test server before each test
  server.urls[INFERENCE_URL].response = {
    type: 'json-value',
    body: {
      created: 1714688002.0557644,
      text: 'Hello there!',
    },
  };
  server.urls[STREAMING_URL].response = {
    type: 'stream-chunks',
    chunks: [
      '{"created": 1728094708.2514212, "idx": 0, "text": "Hello"}',
      '{"created": 1728094708.5789802, "idx": 1, "text": " there"}',
      '{"created": 1728094708.7364252, "idx": 2, "text": "!"}',
    ],
  };
});

const provider = createInflection({
  apiKey: 'test-api-key',
  baseURL: INFERENCE_URL,
});

const model = provider.chat('inflection_3_pi');

describe('doGenerate', () => {
  it('should extract text response', async () => {
    server.urls[INFERENCE_URL].response = {
      type: 'json-value',
      body: {
        created: 1714688002.0557644,
        text: 'Hello there!',
      },
    };

    const result = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(result.text).toBe('Hello there!');
  });

  it('should throw error when trying to use tools', async () => {
    await expect(
      model.doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'regular',
          tools: [
            {
              type: 'function',
              name: 'weatherTool',
              description: 'Get weather information',
              parameters: { type: 'object', properties: {} },
            },
          ],
        },
        prompt: TEST_PROMPT,
      }),
    ).rejects.toThrow('Tool calls are not supported by Inflection AI');
  });

  it('should extract usage', async () => {
    server.urls[INFERENCE_URL].response = {
      type: 'json-value',
      body: {
        created: 1714688002.0557644,
        text: 'Hello there!',
      },
    };

    const { usage } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    // Since Inflection API doesn't return usage info, we should expect undefined or estimated values
    expect(usage).toStrictEqual({
      promptTokens: expect.any(Number),
      completionTokens: expect.any(Number),
    });
  });
});

describe('doStream', () => {
  it('should stream text deltas', async () => {
    server.urls[STREAMING_URL].response = {
      type: 'stream-chunks',
      chunks: ['Hello', ' there', '!'],
    };

    const result = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const parts = await convertReadableStreamToArray(result.stream);
    expect(parts).toMatchSnapshot();
  });
});
