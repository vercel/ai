import {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1CallWarning,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import { delay } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  convertReadableStreamToArray,
  convertResponseStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { jsonSchema } from '@ai-sdk/ui-utils';
import assert from 'node:assert';
import { z } from 'zod';
import { ToolExecutionError } from '../../errors/tool-execution-error';
import { StreamData } from '../../streams/stream-data';
import { createDataStream } from '../data-stream/create-data-stream';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { createMockServerResponse } from '../test/mock-server-response';
import { MockTracer } from '../test/mock-tracer';
import { mockValues } from '../test/mock-values';
import { tool } from '../tool/tool';
import { object, text } from './output';
import { StepResult } from './step-result';
import { streamText } from './stream-text';
import { StreamTextResult, TextStreamPart } from './stream-text-result';
import { ToolSet } from './tool-set';

const defaultSettings = () =>
  ({
    prompt: 'prompt',
    experimental_generateMessageId: mockId({ prefix: 'msg' }),
    _internal: {
      generateId: mockId({ prefix: 'id' }),
      currentDate: () => new Date(0),
    },
  }) as const;

function createTestModel({
  stream = convertArrayToReadableStream([
    {
      type: 'response-metadata',
      id: 'id-0',
      modelId: 'mock-model-id',
      timestamp: new Date(0),
    },
    { type: 'text-delta', textDelta: 'Hello' },
    { type: 'text-delta', textDelta: ', ' },
    { type: 'text-delta', textDelta: `world!` },
    {
      type: 'finish',
      finishReason: 'stop',
      logprobs: undefined,
      usage: { completionTokens: 10, promptTokens: 3 },
    },
  ]),
  rawCall = { rawPrompt: 'prompt', rawSettings: {} },
  rawResponse = undefined,
  request = undefined,
  warnings,
}: {
  stream?: ReadableStream<LanguageModelV1StreamPart>;
  rawResponse?: { headers: Record<string, string> };
  rawCall?: { rawPrompt: string; rawSettings: Record<string, unknown> };
  request?: { body: string };
  warnings?: LanguageModelV1CallWarning[];
} = {}): LanguageModelV1 {
  return new MockLanguageModelV1({
    doStream: async () => ({ stream, rawCall, rawResponse, request, warnings }),
  });
}

const modelWithSources = new MockLanguageModelV1({
  doStream: async () => ({
    stream: convertArrayToReadableStream([
      {
        type: 'source',
        source: {
          sourceType: 'url' as const,
          id: '123',
          url: 'https://example.com',
          title: 'Example',
          providerMetadata: { provider: { custom: 'value' } },
        },
      },
      { type: 'text-delta', textDelta: 'Hello!' },
      {
        type: 'source',
        source: {
          sourceType: 'url' as const,
          id: '456',
          url: 'https://example.com/2',
          title: 'Example 2',
          providerMetadata: { provider: { custom: 'value2' } },
        },
      },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { completionTokens: 10, promptTokens: 3 },
        providerMetadata: { testprovider: { testkey: 'testvalue' } },
      },
    ]),
    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
  }),
});

const modelWithFiles = new MockLanguageModelV1({
  doStream: async () => ({
    stream: convertArrayToReadableStream([
      {
        type: 'file',
        data: 'Hello World',
        mimeType: 'text/plain',
      },
      { type: 'text-delta', textDelta: 'Hello!' },
      {
        type: 'file',
        data: 'QkFVRw==',
        mimeType: 'image/jpeg',
      },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { completionTokens: 10, promptTokens: 3 },
      },
    ]),
    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
  }),
});

const modelWithReasoning = new MockLanguageModelV1({
  doStream: async () => ({
    stream: convertArrayToReadableStream([
      {
        type: 'response-metadata',
        id: 'id-0',
        modelId: 'mock-model-id',
        timestamp: new Date(0),
      },
      { type: 'reasoning', textDelta: 'I will open the conversation' },
      { type: 'reasoning', textDelta: ' with witty banter. ' },
      { type: 'reasoning-signature', signature: '1234567890' },
      { type: 'redacted-reasoning', data: 'redacted-reasoning-data' },
      { type: 'reasoning', textDelta: 'Once the user has relaxed,' },
      {
        type: 'reasoning',
        textDelta: ' I will pry for valuable information.',
      },
      { type: 'reasoning-signature', signature: '1234567890' },
      { type: 'text-delta', textDelta: 'Hi' },
      { type: 'text-delta', textDelta: ' there!' },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { completionTokens: 10, promptTokens: 3 },
      },
    ]),
    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
  }),
});

describe('streamText', () => {
  describe('result.textStream', () => {
    it('should send text deltas', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            expect(mode).toStrictEqual({
              type: 'regular',
              tools: undefined,
              toolChoice: undefined,
            });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerMetadata: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'Hello' },
                { type: 'text-delta', textDelta: ', ' },
                { type: 'text-delta', textDelta: `world!` },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.textStream),
      ).toStrictEqual(['Hello', ', ', 'world!']);
    });

    it('should filter out empty text deltas', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: 'world!' },
            { type: 'text-delta', textDelta: '' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.textStream),
      ).toMatchSnapshot();
    });

    it('should not include reasoning content in textStream', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      expect(
        await convertAsyncIterableToArray(result.textStream),
      ).toMatchSnapshot();
    });

    it('should swallow error to prevent server crash', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.textStream),
      ).toMatchSnapshot();
    });
  });

  describe('result.fullStream', () => {
    it('should send text deltas', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            expect(mode).toStrictEqual({
              type: 'regular',
              tools: undefined,
              toolChoice: undefined,
            });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerMetadata: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'response-id',
                  modelId: 'response-model-id',
                  timestamp: new Date(5000),
                },
                { type: 'text-delta', textDelta: 'Hello' },
                { type: 'text-delta', textDelta: ', ' },
                { type: 'text-delta', textDelta: `world!` },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send reasoning deltas', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send sources', async () => {
      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send files', async () => {
      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should use fallback response metadata when response metadata is not provided', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            expect(mode).toStrictEqual({
              type: 'regular',
              tools: undefined,
              toolChoice: undefined,
            });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerMetadata: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'Hello' },
                { type: 'text-delta', textDelta: ', ' },
                { type: 'text-delta', textDelta: `world!` },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        prompt: 'test-input',
        _internal: {
          currentDate: mockValues(new Date(2000)),
          generateId: mockValues('id-2000'),
        },
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send tool calls', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            expect(mode).toStrictEqual({
              type: 'regular',
              tools: [
                {
                  type: 'function',
                  name: 'tool1',
                  description: undefined,
                  parameters: {
                    $schema: 'http://json-schema.org/draft-07/schema#',
                    additionalProperties: false,
                    properties: { value: { type: 'string' } },
                    required: ['value'],
                    type: 'object',
                  },
                },
              ],
              toolChoice: { type: 'required' },
            });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerMetadata: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  args: `{ "value": "value" }`,
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
          },
        },
        toolChoice: 'required',
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should not send tool call deltas when toolCallStreaming is disabled', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            expect(mode).toStrictEqual({
              type: 'regular',
              tools: [
                {
                  type: 'function',
                  name: 'test-tool',
                  description: undefined,
                  parameters: {
                    $schema: 'http://json-schema.org/draft-07/schema#',
                    additionalProperties: false,
                    properties: { value: { type: 'string' } },
                    required: ['value'],
                    type: 'object',
                  },
                },
              ],
              toolChoice: { type: 'required' },
            });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerMetadata: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: '{"',
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: 'value',
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: '":"',
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: 'Spark',
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: 'le',
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: ' Day',
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: '"}',
                },
                {
                  type: 'tool-call',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  args: '{"value":"Sparkle Day"}',
                },
                {
                  type: 'finish',
                  finishReason: 'tool-calls',
                  logprobs: undefined,
                  usage: { promptTokens: 53, completionTokens: 17 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        tools: {
          'test-tool': {
            parameters: z.object({ value: z.string() }),
          },
        },
        toolChoice: 'required',
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send tool call deltas when toolCallStreaming is enabled', async () => {
      const result = streamText({
        toolCallStreaming: true,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: '{"',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: 'value',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: '":"',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: 'Spark',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: 'le',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: ' Day',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: '"}',
            },
            {
              type: 'tool-call',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              args: '{"value":"Sparkle Day"}',
            },
            {
              type: 'finish',
              finishReason: 'tool-calls',
              logprobs: undefined,
              usage: { promptTokens: 53, completionTokens: 17 },
            },
          ]),
        }),
        tools: {
          'test-tool': {
            parameters: z.object({ value: z.string() }),
          },
        },
        toolChoice: 'required',
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send tool results', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        tools: {
          tool1: tool({
            parameters: z.object({ value: z.string() }),
            execute: async (args, options) => {
              expect(args).toStrictEqual({ value: 'value' });
              expect(options.messages).toStrictEqual([
                { role: 'user', content: 'test-input' },
              ]);
              return `${args.value}-result`;
            },
          }),
        },
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send delayed asynchronous tool results', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              await delay(50); // delay to show bug where step finish is sent before tool result
              return `${value}-result`;
            },
          },
        },
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should filter out empty text deltas', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: 'world!' },
            { type: 'text-delta', textDelta: '' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should forward error in doStream as error stream part', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toStrictEqual([
        {
          type: 'error',
          error: new Error('test error'),
        },
      ]);
    });
  });

  describe('result.pipeDataStreamToResponse', async () => {
    it('should write data stream parts to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.pipeDataStreamToResponse(mockResponse);

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      });
      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should create a Response with a data stream and custom headers', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.pipeDataStreamToResponse(mockResponse, {
        status: 201,
        statusText: 'foo',
        headers: {
          'custom-header': 'custom-value',
        },
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(201);
      expect(mockResponse.statusMessage).toBe('foo');

      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
        'custom-header': 'custom-value',
      });

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should support merging with existing stream data', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const streamData = new StreamData();
      streamData.append('stream-data-value');
      streamData.close();

      result.pipeDataStreamToResponse(mockResponse, {
        data: streamData,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      });

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should mask error messages by default', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.pipeDataStreamToResponse(mockResponse);

      await mockResponse.waitForEnd();

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should support custom error messages', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.pipeDataStreamToResponse(mockResponse, {
        getErrorMessage: error => `custom error message: ${error}`,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should suppress usage information when sendUsage is false', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.pipeDataStreamToResponse(mockResponse, { sendUsage: false });

      await mockResponse.waitForEnd();

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should omit message finish event (d:) when sendFinish is false', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        ...defaultSettings(),
      });

      result.pipeDataStreamToResponse(mockResponse, {
        experimental_sendFinish: false,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should write reasoning content to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      result.pipeDataStreamToResponse(mockResponse, {
        sendReasoning: true,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      });
      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should write source content to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      result.pipeDataStreamToResponse(mockResponse, {
        sendSources: true,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      });
      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should write file content to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      result.pipeDataStreamToResponse(mockResponse);

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      });
      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });
  });

  describe('result.pipeTextStreamToResponse', async () => {
    it('should write text deltas to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: 'world!' },
          ]),
        }),
        prompt: 'test-input',
      });

      result.pipeTextStreamToResponse(mockResponse);

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
      });
      expect(mockResponse.getDecodedChunks()).toEqual([
        'Hello',
        ', ',
        'world!',
      ]);
    });
  });

  describe('result.toDataStream', () => {
    it('should create a data stream', async () => {
      const result = streamText({
        model: createTestModel(),
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream();

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should support merging with existing stream data', async () => {
      const result = streamText({
        model: createTestModel(),
        ...defaultSettings(),
      });

      const streamData = new StreamData();
      streamData.append('stream-data-value');
      streamData.close();

      const dataStream = result.toDataStream({ data: streamData });

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should send tool call and tool result stream parts', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call-delta',
              toolCallId: 'call-1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: '{ "value":',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call-1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: ' "value" }',
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        ...defaultSettings(),
      });

      expect(
        await convertReadableStreamToArray(
          result.toDataStream().pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should send tool call, tool call stream start, tool call deltas, and tool result stream parts when tool call delta flag is enabled', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call-delta',
              toolCallId: 'call-1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: '{ "value":',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call-1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: ' "value" }',
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        toolCallStreaming: true,
        ...defaultSettings(),
      });

      expect(
        await convertReadableStreamToArray(
          result.toDataStream().pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should mask error messages by default', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream();

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should support custom error messages', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream({
        getErrorMessage: error => `custom error message: ${error}`,
      });

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should suppress usage information when sendUsage is false', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream({ sendUsage: false });

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should omit message finish event (d:) when sendFinish is false', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream({
        experimental_sendFinish: false,
      });

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should send reasoning content when sendReasoning is true', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream({ sendReasoning: true });

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should send source content when sendSources is true', async () => {
      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream({ sendSources: true });

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should send file content', async () => {
      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream();

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });
  });

  describe('result.toDataStreamResponse', () => {
    it('should create a Response with a data stream', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponse();

      expect(response.status).toStrictEqual(200);
      expect(Object.fromEntries(response.headers.entries())).toStrictEqual({
        'content-type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      });
      expect(response.headers.get('Content-Type')).toStrictEqual(
        'text/plain; charset=utf-8',
      );
      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should create a Response with a data stream and custom headers', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponse({
        status: 201,
        statusText: 'foo',
        headers: {
          'custom-header': 'custom-value',
        },
      });

      expect(response.status).toStrictEqual(201);
      expect(response.statusText).toStrictEqual('foo');
      expect(Object.fromEntries(response.headers.entries())).toStrictEqual({
        'content-type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
        'custom-header': 'custom-value',
      });
      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should support merging with existing stream data', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const streamData = new StreamData();
      streamData.append('stream-data-value');
      streamData.close();

      const response = result.toDataStreamResponse({ data: streamData });

      expect(response.status).toStrictEqual(200);
      expect(response.headers.get('Content-Type')).toStrictEqual(
        'text/plain; charset=utf-8',
      );
      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should mask error messages by default', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponse();

      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should support custom error messages', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponse({
        getErrorMessage: error => `custom error message: ${error}`,
      });

      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should suppress usage information when sendUsage is false', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponse({ sendUsage: false });

      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });
  });

  describe('result.mergeIntoDataStream', () => {
    it('should merge the result into a data stream', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const dataStream = createDataStream({
        execute(writer) {
          result.mergeIntoDataStream(writer);
        },
      });

      expect(await convertReadableStreamToArray(dataStream)).toMatchSnapshot();
    });

    it('should use the onError handler from the data stream', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const dataStream = createDataStream({
        execute(writer) {
          result.mergeIntoDataStream(writer);
        },
        onError: error => `custom error message: ${error}`,
      });

      expect(await convertReadableStreamToArray(dataStream)).toMatchSnapshot();
    });
  });

  describe('result.toTextStreamResponse', () => {
    it('should create a Response with a text stream', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
      });

      const response = result.toTextStreamResponse();

      expect(response.status).toStrictEqual(200);
      expect(Object.fromEntries(response.headers.entries())).toStrictEqual({
        'content-type': 'text/plain; charset=utf-8',
      });
      expect(await convertResponseStreamToArray(response)).toStrictEqual([
        'Hello',
        ', ',
        'world!',
      ]);
    });
  });

  describe('result.consumeStream', () => {
    it('should ignore AbortError during stream consumption', async () => {
      const result = streamText({
        model: createTestModel({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text-delta', textDelta: 'Hello' });
              queueMicrotask(() => {
                controller.error(
                  Object.assign(new Error('Stream aborted'), {
                    name: 'AbortError',
                  }),
                );
              });
            },
          }),
        }),
        prompt: 'test-input',
      });

      await expect(result.consumeStream()).resolves.not.toThrow();
    });

    it('should ignore ResponseAborted error during stream consumption', async () => {
      const result = streamText({
        model: createTestModel({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text-delta', textDelta: 'Hello' });
              queueMicrotask(() => {
                controller.error(
                  Object.assign(new Error('Response aborted'), {
                    name: 'ResponseAborted',
                  }),
                );
              });
            },
          }),
        }),
        prompt: 'test-input',
      });

      await expect(result.consumeStream()).resolves.not.toThrow();
    });

    it('should ignore any errors during stream consumption', async () => {
      const result = streamText({
        model: createTestModel({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text-delta', textDelta: 'Hello' });
              queueMicrotask(() => {
                controller.error(Object.assign(new Error('Some error')));
              });
            },
          }),
        }),
        prompt: 'test-input',
      });

      await expect(result.consumeStream()).resolves.not.toThrow();
    });

    it('should call the onError callback with the error', async () => {
      const onErrorCallback = vi.fn();
      const result = streamText({
        model: createTestModel({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text-delta', textDelta: 'Hello' });
              queueMicrotask(() => {
                controller.error(Object.assign(new Error('Some error')));
              });
            },
          }),
        }),
        prompt: 'test-input',
      });

      await expect(
        result.consumeStream({ onError: onErrorCallback }),
      ).resolves.not.toThrow();
      expect(onErrorCallback).toHaveBeenCalledWith(new Error('Some error'));
    });
  });

  describe('multiple stream consumption', () => {
    it('should support text stream, ai stream, full stream on single result object', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: 'world!' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect({
        textStream: await convertAsyncIterableToArray(result.textStream),
        fullStream: await convertAsyncIterableToArray(result.fullStream),
        dataStream: await convertReadableStreamToArray(
          result.toDataStream().pipeThrough(new TextDecoderStream()),
        ),
      }).toMatchSnapshot();
    });
  });

  describe('result.warnings', () => {
    it('should resolve with warnings', async () => {
      const result = streamText({
        model: createTestModel({
          warnings: [{ type: 'other', message: 'test-warning' }],
        }),
        prompt: 'test-input',
      });

      result.consumeStream();

      expect(await result.warnings).toStrictEqual([
        { type: 'other', message: 'test-warning' },
      ]);
    });
  });

  describe('result.usage', () => {
    it('should resolve with token usage', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      result.consumeStream();

      assert.deepStrictEqual(await result.usage, {
        completionTokens: 10,
        promptTokens: 3,
        totalTokens: 13,
      });
    });
  });

  describe('result.finishReason', () => {
    it('should resolve with finish reason', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      result.consumeStream();

      expect(await result.finishReason).toStrictEqual('stop');
    });
  });

  describe('result.providerMetadata', () => {
    it('should resolve with provider metadata', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
              providerMetadata: {
                testProvider: { testKey: 'testValue' },
              },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      result.consumeStream();

      expect(await result.providerMetadata).toStrictEqual({
        testProvider: { testKey: 'testValue' },
      });
    });
  });

  describe('result.response.messages', () => {
    it('should contain reasoning', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect((await result.response).messages).toMatchSnapshot();
    });
  });

  describe('result.request', () => {
    it('should resolve with response information', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
          request: { body: 'test body' },
        }),
        prompt: 'test-input',
      });

      result.consumeStream();

      expect(await result.request).toStrictEqual({
        body: 'test body',
      });
    });
  });

  describe('result.response', () => {
    it('should resolve with response information', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
          rawResponse: { headers: { call: '2' } },
        }),
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.response).toMatchSnapshot();
    });
  });

  describe('result.text', () => {
    it('should resolve with full text', async () => {
      const result = streamText({
        model: createTestModel(),
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.text).toMatchSnapshot();
    });
  });

  describe('result.reasoning', () => {
    it('should contain reasoning from model response', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.reasoning).toMatchSnapshot();
    });
  });

  describe('result.reasoningDetails', () => {
    it('should contain reasoning from model response', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.reasoningDetails).toMatchSnapshot();
    });
  });

  describe('result.sources', () => {
    it('should contain sources', async () => {
      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.sources).toMatchSnapshot();
    });
  });

  describe('result.files', () => {
    it('should contain files', async () => {
      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.files).toMatchSnapshot();
    });
  });

  describe('result.steps', () => {
    it('should add the reasoning from the model response to the step result', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.steps).toMatchSnapshot();
    });

    it('should add the sources from the model response to the step result', async () => {
      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.steps).toMatchSnapshot();
    });

    it('should add the files from the model response to the step result', async () => {
      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.steps).toMatchSnapshot();
    });
  });

  describe('result.toolCalls', () => {
    it('should resolve with tool calls', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
          },
        },
        prompt: 'test-input',
      });

      result.consumeStream();

      expect(await result.toolCalls).toStrictEqual([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
        },
      ]);
    });
  });

  describe('result.toolResults', () => {
    it('should resolve with tool results', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        prompt: 'test-input',
      });

      result.consumeStream();

      assert.deepStrictEqual(await result.toolResults, [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
          result: 'value-result',
        },
      ]);
    });
  });

  describe('options.onChunk', () => {
    let result: Array<
      Extract<
        TextStreamPart<any>,
        {
          type:
            | 'text-delta'
            | 'reasoning'
            | 'source'
            | 'tool-call'
            | 'tool-call-streaming-start'
            | 'tool-call-delta'
            | 'tool-result';
        }
      >
    >;

    beforeEach(async () => {
      result = [];

      const resultObject = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'tool-call-delta',
              toolCallId: '1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: '{"value": "',
            },
            {
              type: 'reasoning',
              textDelta: 'Feeling clever',
            },
            {
              type: 'tool-call-delta',
              toolCallId: '1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: 'test',
            },
            {
              type: 'tool-call-delta',
              toolCallId: '1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: '"}',
            },
            {
              type: 'source',
              source: {
                sourceType: 'url' as const,
                id: '123',
                url: 'https://example.com',
                title: 'Example',
                providerMetadata: { provider: { custom: 'value' } },
              },
            },
            {
              type: 'tool-call',
              toolCallId: '1',
              toolCallType: 'function',
              toolName: 'tool1',
              args: `{ "value": "test" }`,
            },
            { type: 'text-delta', textDelta: ' World' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
              },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        prompt: 'test-input',
        toolCallStreaming: true,
        onChunk(event) {
          result.push(event.chunk);
        },
      });

      await resultObject.consumeStream();
    });

    it('should return events in order', async () => {
      expect(result).toMatchSnapshot();
    });
  });

  describe('options.onError', () => {
    it('should invoke onError', async () => {
      const result: Array<{ error: unknown }> = [];

      const resultObject = streamText({
        model: new MockLanguageModelV1({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
        onError(event) {
          result.push(event);
        },
      });

      await resultObject.consumeStream();

      expect(result).toStrictEqual([{ error: new Error('test error') }]);
    });
  });

  describe('options.onFinish', () => {
    it('should send correct information', async () => {
      let result!: Parameters<
        Required<Parameters<typeof streamText>[0]>['onFinish']
      >[0];

      const resultObject = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            { type: 'text-delta', textDelta: `world!` },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
              providerMetadata: {
                testProvider: { testKey: 'testValue' },
              },
            },
          ]),
          rawResponse: { headers: { call: '2' } },
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        onFinish: async event => {
          result = event as unknown as typeof result;
        },
        ...defaultSettings(),
      });

      await resultObject.consumeStream();

      expect(result).toMatchSnapshot();
    });

    it('should send sources', async () => {
      let result!: Parameters<
        Required<Parameters<typeof streamText>[0]>['onFinish']
      >[0];

      const resultObject = streamText({
        model: modelWithSources,
        onFinish: async event => {
          result = event as unknown as typeof result;
        },
        ...defaultSettings(),
      });

      await resultObject.consumeStream();

      expect(result).toMatchSnapshot();
    });

    it('should send files', async () => {
      let result!: Parameters<
        Required<Parameters<typeof streamText>[0]>['onFinish']
      >[0];

      const resultObject = streamText({
        model: modelWithFiles,
        onFinish: async event => {
          result = event as unknown as typeof result;
        },
        ...defaultSettings(),
      });

      await resultObject.consumeStream();

      expect(result).toMatchSnapshot();
    });

    it('should not prevent error from being forwarded', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
        onFinish() {}, // just defined; do nothing
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toStrictEqual([
        {
          type: 'error',
          error: new Error('test error'),
        },
      ]);
    });
  });

  describe('result.responseMessages', () => {
    it('should contain assistant response message when there are no tool calls', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, ' },
            { type: 'text-delta', textDelta: 'world!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.consumeStream();

      expect((await result.response).messages).toMatchSnapshot();
    });

    it('should contain assistant response message and tool message when there are tool calls with results', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, ' },
            { type: 'text-delta', textDelta: 'world!' },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async () => 'result1',
          },
        },
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.consumeStream();

      expect((await result.response).messages).toMatchSnapshot();
    });
  });

  describe('options.maxSteps', () => {
    let result: StreamTextResult<any, any>;
    let onFinishResult: Parameters<
      Required<Parameters<typeof streamText>[0]>['onFinish']
    >[0];
    let onStepFinishResults: StepResult<any>[];
    let tracer: MockTracer;

    beforeEach(() => {
      tracer = new MockTracer();
    });

    describe('2 steps: initial, tool-result', () => {
      beforeEach(async () => {
        result = undefined as any;
        onFinishResult = undefined as any;
        onStepFinishResults = [];

        let responseCount = 0;
        result = streamText({
          model: new MockLanguageModelV1({
            doStream: async ({ prompt, mode }) => {
              switch (responseCount++) {
                case 0: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    tools: [
                      {
                        type: 'function',
                        name: 'tool1',
                        description: undefined,
                        parameters: {
                          $schema: 'http://json-schema.org/draft-07/schema#',
                          additionalProperties: false,
                          properties: { value: { type: 'string' } },
                          required: ['value'],
                          type: 'object',
                        },
                      },
                    ],
                    toolChoice: { type: 'auto' },
                  });

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-0',
                        modelId: 'mock-model-id',
                        timestamp: new Date(0),
                      },
                      {
                        type: 'reasoning',
                        textDelta: 'thinking',
                      },
                      {
                        type: 'tool-call',
                        toolCallType: 'function',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        args: `{ "value": "value" }`,
                      },
                      {
                        type: 'finish',
                        finishReason: 'tool-calls',
                        logprobs: undefined,
                        usage: { completionTokens: 10, promptTokens: 3 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                    rawResponse: { headers: { call: '1' } },
                  };
                }
                case 1: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    tools: [
                      {
                        type: 'function',
                        name: 'tool1',
                        description: undefined,
                        parameters: {
                          $schema: 'http://json-schema.org/draft-07/schema#',
                          additionalProperties: false,
                          properties: { value: { type: 'string' } },
                          required: ['value'],
                          type: 'object',
                        },
                      },
                    ],
                    toolChoice: { type: 'auto' },
                  });

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'reasoning',
                          text: 'thinking',
                          providerMetadata: undefined,
                          signature: undefined,
                        },
                        {
                          type: 'tool-call',
                          toolCallId: 'call-1',
                          toolName: 'tool1',
                          args: { value: 'value' },
                          providerMetadata: undefined,
                        },
                      ],
                      providerMetadata: undefined,
                    },
                    {
                      role: 'tool',
                      content: [
                        {
                          type: 'tool-result',
                          toolCallId: 'call-1',
                          toolName: 'tool1',
                          result: 'result1',
                          content: undefined,
                          isError: undefined,
                          providerMetadata: undefined,
                        },
                      ],
                      providerMetadata: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-1',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      { type: 'text-delta', textDelta: 'Hello, ' },
                      { type: 'text-delta', textDelta: `world!` },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        logprobs: undefined,
                        usage: { completionTokens: 5, promptTokens: 1 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                    rawResponse: { headers: { call: '2' } },
                  };
                }
                default:
                  throw new Error(
                    `Unexpected response count: ${responseCount}`,
                  );
              }
            },
          }),
          tools: {
            tool1: {
              parameters: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          prompt: 'test-input',
          onFinish: async event => {
            expect(onFinishResult).to.be.undefined;
            onFinishResult = event as unknown as typeof onFinishResult;
          },
          onStepFinish: async event => {
            onStepFinishResults.push(event);
          },
          experimental_telemetry: { isEnabled: true, tracer },
          maxSteps: 3,
          _internal: {
            now: mockValues(0, 100, 500, 600, 1000),
          },
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });
      });

      it('should contain assistant response message and tool message from all steps', async () => {
        expect(
          await convertAsyncIterableToArray(result.fullStream),
        ).toMatchSnapshot();
      });

      describe('callbacks', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('onFinish should send correct information', async () => {
          expect(onFinishResult).toMatchSnapshot();
        });

        it('onStepFinish should send correct information', async () => {
          expect(onStepFinishResults).toMatchSnapshot();
        });
      });

      describe('value promises', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('result.usage should contain total token usage', async () => {
          assert.deepStrictEqual(await result.usage, {
            completionTokens: 15,
            promptTokens: 4,
            totalTokens: 19,
          });
        });

        it('result.finishReason should contain finish reason from final step', async () => {
          assert.strictEqual(await result.finishReason, 'stop');
        });

        it('result.text should contain text from final step', async () => {
          assert.strictEqual(await result.text, 'Hello, world!');
        });

        it('result.steps should contain all steps', async () => {
          expect(await result.steps).toMatchSnapshot();
        });

        it('result.response.messages should contain response messages from all steps', async () => {
          expect((await result.response).messages).toMatchSnapshot();
        });
      });

      it('should record telemetry data for each step', async () => {
        await result.consumeStream();
        expect(tracer.jsonSpans).toMatchSnapshot();
      });
    });

    describe('4 steps: initial, continue, continue, continue', () => {
      beforeEach(async () => {
        result = undefined as any;
        onFinishResult = undefined as any;
        onStepFinishResults = [];

        let responseCount = 0;
        result = streamText({
          model: new MockLanguageModelV1({
            doStream: async ({ prompt, mode }) => {
              switch (responseCount++) {
                case 0: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    toolChoice: undefined,
                    tools: undefined,
                  });
                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-0',
                        modelId: 'mock-model-id',
                        timestamp: new Date(0),
                      },
                      // trailing text is to be discarded, trailing whitespace is to be kept:
                      { type: 'text-delta', textDelta: 'pa' },
                      { type: 'text-delta', textDelta: 'rt ' },
                      { type: 'text-delta', textDelta: '1 \n' },
                      { type: 'text-delta', textDelta: ' to-be' },
                      { type: 'text-delta', textDelta: '-discar' },
                      { type: 'text-delta', textDelta: 'ded' },
                      {
                        type: 'finish',
                        finishReason: 'length',
                        logprobs: undefined,
                        usage: { completionTokens: 20, promptTokens: 10 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                  };
                }
                case 1: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    toolChoice: undefined,
                    tools: undefined,
                  });
                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'part 1 \n ',
                          providerMetadata: undefined,
                        },
                      ],
                      providerMetadata: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-1',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      // case where there is no leading nor trailing whitespace:
                      { type: 'text-delta', textDelta: 'no-' },
                      {
                        type: 'source',
                        source: {
                          sourceType: 'url' as const,
                          id: '123',
                          url: 'https://example.com',
                          title: 'Example',
                          providerMetadata: { provider: { custom: 'value' } },
                        },
                      },
                      { type: 'text-delta', textDelta: 'whitespace' },
                      {
                        type: 'finish',
                        finishReason: 'length',
                        logprobs: undefined,
                        usage: { completionTokens: 5, promptTokens: 30 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                  };
                }
                case 2: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    toolChoice: undefined,
                    tools: undefined,
                  });

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'part 1 \n ',
                          providerMetadata: undefined,
                        },
                        {
                          type: 'text',
                          text: 'no-whitespace',
                          providerMetadata: undefined,
                        },
                      ],
                      providerMetadata: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-2',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      {
                        type: 'source',
                        source: {
                          sourceType: 'url' as const,
                          id: '456',
                          url: 'https://example.com/2',
                          title: 'Example 2',
                          providerMetadata: { provider: { custom: 'value2' } },
                        },
                      },
                      // set up trailing whitespace for next step:
                      { type: 'text-delta', textDelta: 'immediatefollow  ' },
                      {
                        type: 'source',
                        source: {
                          sourceType: 'url' as const,
                          id: '789',
                          url: 'https://example.com/3',
                          title: 'Example 3',
                          providerMetadata: { provider: { custom: 'value3' } },
                        },
                      },
                      {
                        type: 'finish',
                        finishReason: 'length',
                        logprobs: undefined,
                        usage: { completionTokens: 2, promptTokens: 3 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                    rawResponse: { headers: { call: '3' } },
                  };
                }
                case 3: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    toolChoice: undefined,
                    tools: undefined,
                  });

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'part 1 \n ',
                          providerMetadata: undefined,
                        },
                        {
                          type: 'text',
                          text: 'no-whitespace',
                          providerMetadata: undefined,
                        },
                        {
                          type: 'text',
                          text: 'immediatefollow  ',
                          providerMetadata: undefined,
                        },
                      ],
                      providerMetadata: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-3',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      // leading whitespace is to be discarded when there is whitespace from previous step
                      // (for models such as Anthropic that trim trailing whitespace in their inputs):
                      { type: 'text-delta', textDelta: ' ' }, // split into 2 chunks for test coverage
                      { type: 'text-delta', textDelta: '  final' },
                      { type: 'text-delta', textDelta: ' va' },
                      { type: 'text-delta', textDelta: 'lue keep all w' },
                      { type: 'text-delta', textDelta: 'hitespace' },
                      { type: 'text-delta', textDelta: '\n ' },
                      { type: 'text-delta', textDelta: 'en' },
                      { type: 'text-delta', textDelta: 'd' },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        logprobs: undefined,
                        usage: { completionTokens: 2, promptTokens: 3 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                    rawResponse: { headers: { call: '3' } },
                  };
                }
                default:
                  throw new Error(
                    `Unexpected response count: ${responseCount}`,
                  );
              }
            },
          }),
          prompt: 'test-input',
          maxSteps: 5,
          experimental_continueSteps: true,
          onFinish: async event => {
            expect(onFinishResult).to.be.undefined;
            onFinishResult = event as unknown as typeof onFinishResult;
          },
          onStepFinish: async event => {
            onStepFinishResults.push(event);
          },
          experimental_telemetry: { isEnabled: true, tracer },
          _internal: {
            now: mockValues(0, 100, 500, 600, 1000),
          },
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });
      });

      it('should contain text deltas from all steps', async () => {
        expect(
          await convertAsyncIterableToArray(result.fullStream),
        ).toMatchSnapshot();
      });

      describe('callbacks', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('onFinish should send correct information', async () => {
          expect(onFinishResult).toMatchSnapshot();
        });

        it('onStepFinish should send correct information', async () => {
          expect(onStepFinishResults).toMatchSnapshot();
        });
      });

      describe('value promises', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('result.usage should contain total token usage', async () => {
          expect(await result.usage).toStrictEqual({
            completionTokens: 29,
            promptTokens: 46,
            totalTokens: 75,
          });
        });

        it('result.finishReason should contain finish reason from final step', async () => {
          assert.strictEqual(await result.finishReason, 'stop');
        });

        it('result.text should contain combined text from all steps', async () => {
          assert.strictEqual(
            await result.text,
            'part 1 \n no-whitespaceimmediatefollow  final value keep all whitespace\n end',
          );
        });

        it('result.steps should contain all steps', async () => {
          expect(await result.steps).toMatchSnapshot();
        });

        it('result.response.messages should contain an assistant message with the combined text', async () => {
          expect((await result.response).messages).toStrictEqual([
            {
              role: 'assistant',
              id: expect.any(String),
              content: [
                {
                  type: 'text',
                  text: 'part 1 \n no-whitespaceimmediatefollow  final value keep all whitespace\n end',
                },
              ],
            },
          ]);
        });
      });

      it('should record telemetry data for each step', async () => {
        await result.consumeStream();
        expect(tracer.jsonSpans).toMatchSnapshot();
      });

      it('should generate correct data stream', async () => {
        const dataStream = result.toDataStream();

        expect(
          await convertReadableStreamToArray(
            dataStream.pipeThrough(new TextDecoderStream()),
          ),
        ).toMatchSnapshot();
      });

      it('result.sources should contain sources from all steps', async () => {
        result.consumeStream();
        expect(await result.sources).toMatchSnapshot();
      });
    });

    describe('2 steps: initial, tool-result with experimental_prepareStep', () => {
      beforeEach(async () => {
        result = undefined as any;
        onFinishResult = undefined as any;
        onStepFinishResults = [];

        let responseCount = 0;

        const trueModel = new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            switch (responseCount++) {
              case 0: {
                expect(mode).toStrictEqual({
                  type: 'regular',
                  tools: [
                    {
                      type: 'function',
                      name: 'tool1',
                      description: undefined,
                      parameters: {
                        $schema: 'http://json-schema.org/draft-07/schema#',
                        additionalProperties: false,
                        properties: { value: { type: 'string' } },
                        required: ['value'],
                        type: 'object',
                      },
                    },
                  ],
                  toolChoice: { type: 'tool', toolName: 'tool1' },
                });

                expect(prompt).toStrictEqual([
                  {
                    role: 'user',
                    content: [{ type: 'text', text: 'test-input' }],
                    providerMetadata: undefined,
                  },
                ]);

                return {
                  stream: convertArrayToReadableStream([
                    {
                      type: 'response-metadata',
                      id: 'id-0',
                      modelId: 'mock-model-id',
                      timestamp: new Date(0),
                    },
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      args: '{ "value": "value" }',
                    },
                    {
                      type: 'finish',
                      finishReason: 'tool-calls',
                      logprobs: undefined,
                      usage: { completionTokens: 5, promptTokens: 10 },
                    },
                  ]),
                  rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                };
              }
              case 1: {
                expect(mode).toStrictEqual({
                  type: 'regular',
                  tools: [],
                  toolChoice: { type: 'auto' },
                });

                expect(prompt).toStrictEqual([
                  {
                    role: 'user',
                    content: [{ type: 'text', text: 'test-input' }],
                    providerMetadata: undefined,
                  },
                  {
                    role: 'assistant',
                    content: [
                      {
                        type: 'tool-call',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        args: { value: 'value' },
                        providerMetadata: undefined,
                      },
                    ],
                    providerMetadata: undefined,
                  },
                  {
                    role: 'tool',
                    content: [
                      {
                        type: 'tool-result',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        result: 'result1',
                        content: undefined,
                        isError: undefined,
                        providerMetadata: undefined,
                      },
                    ],
                    providerMetadata: undefined,
                  },
                ]);

                return {
                  stream: convertArrayToReadableStream([
                    {
                      type: 'response-metadata',
                      id: 'id-1',
                      modelId: 'mock-model-id',
                      timestamp: new Date(10000),
                    },
                    { type: 'text-delta', textDelta: 'Hello, world!' },
                    {
                      type: 'finish',
                      finishReason: 'stop',
                      logprobs: undefined,
                      usage: { completionTokens: 15, promptTokens: 10 },
                    },
                  ]),
                  rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                  rawResponse: {
                    headers: {
                      'custom-response-header': 'response-header-value',
                    },
                  },
                };
              }
              default:
                throw new Error(`Unexpected response count: ${responseCount}`);
            }
          },
        });

        const modelWithFiles = new MockLanguageModelV1({
          doStream: async () => ({
            stream: convertArrayToReadableStream([
              {
                type: 'file',
                data: new Uint8Array([1, 2, 3]),
                mimeType: 'image/png',
              },
              { type: 'text-delta', textDelta: 'Hello, world!' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { completionTokens: 20, promptTokens: 10 },
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          }),
        });

        result = streamText({
          model: trueModel,
          tools: {
            tool1: tool({
              parameters: z.object({ value: z.string() }),
              execute: async (args, options) => {
                expect(args).toStrictEqual({ value: 'value' });
                expect(options.messages).toStrictEqual([
                  { role: 'user', content: 'test-input' },
                ]);
                return 'result1';
              },
            }),
          },
          prompt: 'test-input',
          maxSteps: 3,
          onFinish: async event => {
            expect(onFinishResult).to.be.undefined;
            onFinishResult = event as unknown as typeof onFinishResult;
          },
          onStepFinish: async event => {
            onStepFinishResults.push(event);
          },
          experimental_prepareStep: async ({ model, stepNumber, steps }) => {
            if (stepNumber === 0) {
              expect(model).toStrictEqual(trueModel);
              expect(steps).toStrictEqual([]);
              return {
                model: trueModel,
                toolChoice: {
                  type: 'tool',
                  toolName: 'tool1' as const,
                },
              };
            }

            if (stepNumber === 1) {
              expect(model).toStrictEqual(trueModel);
              expect(steps.length).toStrictEqual(1);
              return { model: modelWithFiles, experimental_activeTools: [] };
            }
          },
          experimental_telemetry: { isEnabled: true, tracer },
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });
      });

      it('should contain assistant response message and tool message from all steps', async () => {
        expect(
          await convertAsyncIterableToArray(result.fullStream),
        ).toMatchSnapshot();
      });

      describe('callbacks', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('onFinish should send correct information', async () => {
          expect(onFinishResult).toMatchSnapshot();
        });

        it('onStepFinish should send correct information', async () => {
          expect(onStepFinishResults).toMatchSnapshot();
        });
      });

      describe('value promises', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('result.text should return text from last step', async () => {
          assert.strictEqual(await result.text, 'Hello, world!');
        });

        it('result.toolCalls should return empty tool calls from last step', async () => {
          assert.deepStrictEqual(await result.toolCalls, []);
        });

        it('result.toolResults should return empty tool results from last step', async () => {
          assert.deepStrictEqual(await result.toolResults, []);
        });

        it('result.usage should sum token usage', async () => {
          assert.deepStrictEqual(await result.usage, {
            completionTokens: 25,
            promptTokens: 20,
            totalTokens: 45,
          });
        });

        it('result.steps should contain all steps', async () => {
          expect(await result.steps).toMatchSnapshot();
        });

        it('result.response.messages should contain response messages from all steps', async () => {
          expect((await result.response).messages).toMatchSnapshot();
        });
      });

      it('should record telemetry data for each step', async () => {
        await result.consumeStream();
        expect(tracer.jsonSpans).toMatchSnapshot();
      });
    });
  });

  describe('options.headers', () => {
    it('should set headers', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ headers }) => {
            expect(headers).toStrictEqual({
              'custom-request-header': 'request-header-value',
            });

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'Hello' },
                { type: 'text-delta', textDelta: ', ' },
                { type: 'text-delta', textDelta: `world!` },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        prompt: 'test-input',
        headers: { 'custom-request-header': 'request-header-value' },
      });

      assert.deepStrictEqual(
        await convertAsyncIterableToArray(result.textStream),
        ['Hello', ', ', 'world!'],
      );
    });
  });

  describe('options.providerMetadata', () => {
    it('should pass provider metadata to model', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ providerMetadata }) => {
            expect(providerMetadata).toStrictEqual({
              aProvider: { someKey: 'someValue' },
            });

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'provider metadata test' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        prompt: 'test-input',
        providerOptions: {
          aProvider: { someKey: 'someValue' },
        },
      });

      assert.deepStrictEqual(
        await convertAsyncIterableToArray(result.textStream),
        ['provider metadata test'],
      );
    });
  });

  describe('options.abortSignal', () => {
    it('should forward abort signal to tool execution during streaming', async () => {
      const abortController = new AbortController();
      const toolExecuteMock = vi.fn().mockResolvedValue('tool result');

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 10, completionTokens: 20 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: toolExecuteMock,
          },
        },
        prompt: 'test-input',
        abortSignal: abortController.signal,
      });

      await convertAsyncIterableToArray(result.fullStream);

      abortController.abort();

      expect(toolExecuteMock).toHaveBeenCalledWith(
        { value: 'value' },
        {
          abortSignal: abortController.signal,
          toolCallId: 'call-1',
          messages: expect.any(Array),
        },
      );
    });
  });

  describe('telemetry', () => {
    let tracer: MockTracer;

    beforeEach(() => {
      tracer = new MockTracer();
    });

    it('should not record any telemetry data when not explicitly enabled', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        _internal: {
          now: mockValues(0, 100, 500),
        },
      });

      await result.consumeStream();

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('should record telemetry data when enabled', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        topK: 0.1,
        topP: 0.2,
        frequencyPenalty: 0.3,
        presencePenalty: 0.4,
        temperature: 0.5,
        stopSequences: ['stop'],
        headers: {
          header1: 'value1',
          header2: 'value2',
        },
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'test-function-id',
          metadata: {
            test1: 'value1',
            test2: false,
          },
          tracer,
        },
        _internal: { now: mockValues(0, 100, 500) },
      });

      await result.consumeStream();

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('should record successful tool call', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 20, promptTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        prompt: 'test-input',
        experimental_telemetry: { isEnabled: true, tracer },
        _internal: { now: mockValues(0, 100, 500) },
      });

      await result.consumeStream();

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('should record error on tool call', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async () => {
              throw new Error('Tool execution failed');
            },
          },
        },
        prompt: 'test-input',
        experimental_telemetry: { isEnabled: true, tracer },
        _internal: { now: mockValues(0, 100, 500) },
      });

      await result.consumeStream();

      expect(tracer.jsonSpans).toHaveLength(3);

      // Check that we have the expected spans
      expect(tracer.jsonSpans[0].name).toBe('ai.streamText');
      expect(tracer.jsonSpans[1].name).toBe('ai.streamText.doStream');
      expect(tracer.jsonSpans[2].name).toBe('ai.toolCall');

      // Check that the tool call span has error status
      const toolCallSpan = tracer.jsonSpans[2];
      expect(toolCallSpan.status).toEqual({
        code: 2,
        message: 'Tool execution failed',
      });

      // Check that the tool call span has exception event
      expect(toolCallSpan.events).toHaveLength(1);
      const exceptionEvent = toolCallSpan.events[0];
      expect(exceptionEvent.name).toBe('exception');
      expect(exceptionEvent.attributes).toMatchObject({
        'exception.message': 'Tool execution failed',
        'exception.name': 'Error',
      });
      expect(exceptionEvent.attributes?.['exception.stack']).toContain(
        'Tool execution failed',
      );
      expect(exceptionEvent.time).toEqual([0, 0]);
    });

    it('should not record telemetry inputs / outputs when disabled', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 20, promptTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        prompt: 'test-input',
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: false,
          recordOutputs: false,
          tracer,
        },
        _internal: { now: mockValues(0, 100, 500) },
      });

      await result.consumeStream();

      expect(tracer.jsonSpans).toMatchSnapshot();
    });
  });

  describe('tools with custom schema', () => {
    it('should send tool calls', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            expect(mode).toStrictEqual({
              type: 'regular',
              tools: [
                {
                  type: 'function',
                  name: 'tool1',
                  description: undefined,
                  parameters: {
                    additionalProperties: false,
                    properties: { value: { type: 'string' } },
                    required: ['value'],
                    type: 'object',
                  },
                },
              ],
              toolChoice: { type: 'required' },
            });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerMetadata: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  args: `{ "value": "value" }`,
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        tools: {
          tool1: {
            parameters: jsonSchema<{ value: string }>({
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
            }),
          },
        },
        toolChoice: 'required',
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
        _internal: {
          now: mockValues(0, 100, 500),
        },
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });
  });

  describe('options.messages', () => {
    it('should detect and convert ui messages', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt }) => {
            expect(prompt).toStrictEqual([
              {
                content: [
                  {
                    text: 'prompt',
                    type: 'text',
                  },
                ],
                providerMetadata: undefined,
                role: 'user',
              },
              {
                content: [
                  {
                    args: {
                      value: 'test-value',
                    },
                    providerMetadata: undefined,
                    toolCallId: 'call-1',
                    toolName: 'test-tool',
                    type: 'tool-call',
                  },
                ],
                providerMetadata: undefined,
                role: 'assistant',
              },
              {
                content: [
                  {
                    content: undefined,
                    isError: undefined,
                    providerMetadata: undefined,
                    result: 'test result',
                    toolCallId: 'call-1',
                    toolName: 'test-tool',
                    type: 'tool-result',
                  },
                ],
                providerMetadata: undefined,
                role: 'tool',
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'Hello' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        messages: [
          {
            role: 'user',
            content: 'prompt',
          },
          {
            role: 'assistant',
            content: '',
            toolInvocations: [
              {
                state: 'result',
                toolCallId: 'call-1',
                toolName: 'test-tool',
                args: { value: 'test-value' },
                result: 'test result',
              },
            ],
          },
        ],
      });

      expect(
        await convertAsyncIterableToArray(result.textStream),
      ).toStrictEqual(['Hello']);
    });

    it('should support models that use "this" context in supportsUrl', async () => {
      let supportsUrlCalled = false;
      class MockLanguageModelWithImageSupport extends MockLanguageModelV1 {
        readonly supportsImageUrls = false;

        constructor() {
          super({
            supportsUrl(url: URL) {
              supportsUrlCalled = true;
              // Reference 'this' to verify context
              return this.modelId === 'mock-model-id';
            },
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'Hello' },
                { type: 'text-delta', textDelta: ', ' },
                { type: 'text-delta', textDelta: 'world!' },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          });
        }
      }

      const model = new MockLanguageModelWithImageSupport();
      const result = streamText({
        model,
        messages: [
          {
            role: 'user',
            content: [{ type: 'image', image: 'https://example.com/test.jpg' }],
          },
        ],
      });

      await result.consumeStream();

      expect(supportsUrlCalled).toBe(true);
      expect(await result.text).toBe('Hello, world!');
    });
  });

  describe('tool execution errors', () => {
    it('should send a ToolExecutionError when a tool execution throws an error', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        tools: {
          tool1: tool({
            parameters: z.object({ value: z.string() }),
            execute: async (): Promise<string> => {
              throw new Error('test error');
            },
          }),
        },
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toStrictEqual([
        {
          type: 'step-start',
          request: {},
          warnings: [],
          messageId: expect.any(String),
        },
        {
          type: 'tool-call',
          args: {
            value: 'value',
          },
          toolCallId: 'call-1',
          toolName: 'tool1',
        },
        {
          type: 'error',
          error: new ToolExecutionError({
            toolName: 'tool1',
            toolCallId: 'call-1',
            toolArgs: { value: 'value' },
            cause: new Error('test error'),
          }),
        },
        {
          type: 'step-finish',
          messageId: expect.any(String),
          providerMetadata: undefined,
          experimental_providerMetadata: undefined,
          finishReason: 'stop',
          isContinued: false,
          logprobs: undefined,
          request: {},
          response: {
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
            headers: undefined,
          },
          warnings: undefined,
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
        },
        {
          type: 'finish',
          providerMetadata: undefined,
          experimental_providerMetadata: undefined,
          finishReason: 'stop',
          logprobs: undefined,
          response: {
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
            headers: undefined,
          },
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
        },
      ]);
    });
  });

  describe('options.transform', () => {
    describe('with base transformation', () => {
      const upperCaseTransform =
        <TOOLS extends ToolSet>() =>
        (options: { tools: TOOLS }) =>
          new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
            transform(chunk, controller) {
              if (chunk.type === 'text-delta') {
                chunk.textDelta = chunk.textDelta.toUpperCase();
              }

              if (chunk.type === 'tool-call-delta') {
                chunk.argsTextDelta = chunk.argsTextDelta.toUpperCase();
              }

              // assuming test arg structure:
              if (chunk.type === 'tool-call') {
                chunk.args = {
                  ...chunk.args,
                  value: chunk.args.value.toUpperCase(),
                };
              }

              if (chunk.type === 'tool-result') {
                chunk.result = chunk.result.toUpperCase();
                chunk.args = {
                  ...chunk.args,
                  value: chunk.args.value.toUpperCase(),
                };
              }

              if (chunk.type === 'step-finish') {
                if (chunk.request.body != null) {
                  chunk.request.body = chunk.request.body.toUpperCase();
                }
              }

              if (chunk.type === 'finish') {
                if (chunk.providerMetadata?.testProvider != null) {
                  chunk.providerMetadata.testProvider = {
                    testKey: 'TEST VALUE',
                  };
                }
              }

              controller.enqueue(chunk);
            },
          });

      it('should transform the stream', async () => {
        const result = streamText({
          model: createTestModel(),
          experimental_transform: upperCaseTransform(),
          prompt: 'test-input',
        });

        expect(
          await convertAsyncIterableToArray(result.textStream),
        ).toStrictEqual(['HELLO', ', ', 'WORLD!']);
      });

      it('result.text should be transformed', async () => {
        const result = streamText({
          model: createTestModel(),
          experimental_transform: upperCaseTransform(),
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.text).toStrictEqual('HELLO, WORLD!');
      });

      it('result.response.messages should be transformed', async () => {
        const result = streamText({
          model: createTestModel(),
          experimental_transform: upperCaseTransform(),
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.response).toStrictEqual({
          id: expect.any(String),
          timestamp: expect.any(Date),
          modelId: expect.any(String),
          headers: undefined,
          messages: [
            {
              role: 'assistant',
              id: expect.any(String),
              content: [
                {
                  text: 'HELLO, WORLD!',
                  type: 'text',
                },
              ],
            },
          ],
        });
      });

      it('result.usage should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { completionTokens: 20, promptTokens: 5 },
              },
            ]),
          }),
          experimental_transform: () =>
            new TransformStream<TextStreamPart<any>, TextStreamPart<any>>({
              transform(chunk, controller) {
                if (chunk.type === 'finish') {
                  chunk.usage = {
                    completionTokens: 100,
                    promptTokens: 200,
                    totalTokens: 300,
                  };
                }
                controller.enqueue(chunk);
              },
            }),
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.usage).toStrictEqual({
          completionTokens: 100,
          promptTokens: 200,
          totalTokens: 300,
        });
      });

      it('result.finishReason should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello' },
              {
                type: 'finish',
                finishReason: 'length',
                logprobs: undefined,
                usage: { completionTokens: 20, promptTokens: 5 },
              },
            ]),
          }),
          experimental_transform: () =>
            new TransformStream<TextStreamPart<any>, TextStreamPart<any>>({
              transform(chunk, controller) {
                if (chunk.type === 'finish') {
                  chunk.finishReason = 'stop';
                }
                controller.enqueue(chunk);
              },
            }),
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.finishReason).toStrictEqual('stop');
      });

      it('result.toolCalls should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello, ' },
              { type: 'text-delta', textDelta: 'world!' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { promptTokens: 3, completionTokens: 10 },
              },
            ]),
          }),
          tools: {
            tool1: {
              parameters: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          experimental_transform: upperCaseTransform(),
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.toolCalls).toStrictEqual([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'tool1',
            args: { value: 'VALUE' },
          },
        ]);
      });

      it('result.toolResults should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello, ' },
              { type: 'text-delta', textDelta: 'world!' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { promptTokens: 3, completionTokens: 10 },
              },
            ]),
          }),
          tools: {
            tool1: {
              parameters: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          experimental_transform: upperCaseTransform(),
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.toolResults).toStrictEqual([
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'tool1',
            args: { value: 'VALUE' },
            result: 'RESULT1',
          },
        ]);
      });

      it('result.steps should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-delta', textDelta: 'Hello, ' },
              { type: 'text-delta', textDelta: 'world!' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { promptTokens: 3, completionTokens: 10 },
              },
            ]),
          }),
          tools: {
            tool1: {
              parameters: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          experimental_transform: upperCaseTransform(),
          prompt: 'test-input',
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });

        result.consumeStream();

        expect(await result.steps).toMatchSnapshot();
      });

      it('result.request should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-delta', textDelta: 'Hello' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            request: { body: 'test body' },
          }),
          prompt: 'test-input',
          experimental_transform: upperCaseTransform(),
        });

        result.consumeStream();

        expect(await result.request).toStrictEqual({
          body: 'TEST BODY',
        });
      });

      it('result.providerMetadata should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-delta', textDelta: 'Hello' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { completionTokens: 10, promptTokens: 3 },
                providerMetadata: {
                  testProvider: {
                    testKey: 'testValue',
                  },
                },
              },
            ]),
            request: { body: 'test body' },
          }),
          prompt: 'test-input',
          experimental_transform: upperCaseTransform(),
        });

        result.consumeStream();

        expect(JSON.stringify(await result.providerMetadata)).toStrictEqual(
          JSON.stringify({
            testProvider: {
              testKey: 'TEST VALUE',
            },
          }),
        );
      });

      it('options.onFinish should receive transformed data', async () => {
        let result!: Parameters<
          Required<Parameters<typeof streamText>[0]>['onFinish']
        >[0];

        const resultObject = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-delta', textDelta: 'Hello' },
              { type: 'text-delta', textDelta: ', ' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
              { type: 'text-delta', textDelta: `world!` },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { completionTokens: 10, promptTokens: 3 },
                providerMetadata: {
                  testProvider: { testKey: 'testValue' },
                },
              },
            ]),
            rawResponse: { headers: { call: '2' } },
          }),
          tools: {
            tool1: {
              parameters: z.object({ value: z.string() }),
              execute: async ({ value }) => `${value}-result`,
            },
          },
          prompt: 'test-input',
          onFinish: async event => {
            result = event as unknown as typeof result;
          },
          experimental_transform: upperCaseTransform(),
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });

        await resultObject.consumeStream();

        expect(result).toMatchSnapshot();
      });

      it('options.onStepFinish should receive transformed data', async () => {
        let result!: Parameters<
          Required<Parameters<typeof streamText>[0]>['onStepFinish']
        >[0];

        const resultObject = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-delta', textDelta: 'Hello' },
              { type: 'text-delta', textDelta: ', ' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
              { type: 'text-delta', textDelta: `world!` },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { completionTokens: 10, promptTokens: 3 },
                providerMetadata: {
                  testProvider: { testKey: 'testValue' },
                },
              },
            ]),
            rawResponse: { headers: { call: '2' } },
          }),
          tools: {
            tool1: tool({
              parameters: z.object({ value: z.string() }),
              execute: async ({ value }) => `${value}-result`,
            }),
          },
          prompt: 'test-input',
          onStepFinish: async event => {
            result = event as unknown as typeof result;
          },
          experimental_transform: upperCaseTransform(),
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });

        await resultObject.consumeStream();

        expect(result).toMatchSnapshot();
      });

      it('telemetry should record transformed data when enabled', async () => {
        const tracer = new MockTracer();

        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-delta', textDelta: 'Hello' },
              { type: 'text-delta', textDelta: ', ' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
              { type: 'text-delta', textDelta: `world!` },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { completionTokens: 10, promptTokens: 3 },
                providerMetadata: {
                  testProvider: { testKey: 'testValue' },
                },
              },
            ]),
          }),
          tools: {
            tool1: tool({
              parameters: z.object({ value: z.string() }),
              execute: async ({ value }) => `${value}-result`,
            }),
          },
          prompt: 'test-input',
          experimental_transform: upperCaseTransform(),
          experimental_telemetry: { isEnabled: true, tracer },
          _internal: { now: mockValues(0, 100, 500) },
        });

        await result.consumeStream();

        expect(tracer.jsonSpans).toMatchSnapshot();
      });

      it('it should send transformed chunks to onChunk', async () => {
        const result: Array<
          Extract<
            TextStreamPart<any>,
            {
              type:
                | 'text-delta'
                | 'reasoning'
                | 'source'
                | 'tool-call'
                | 'tool-call-streaming-start'
                | 'tool-call-delta'
                | 'tool-result';
            }
          >
        > = [];

        const resultObject = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello' },
              { type: 'reasoning', textDelta: 'Feeling clever' },
              {
                type: 'tool-call-delta',
                toolCallId: '1',
                toolCallType: 'function',
                toolName: 'tool1',
                argsTextDelta: '{"value": "',
              },
              {
                type: 'tool-call-delta',
                toolCallId: '1',
                toolCallType: 'function',
                toolName: 'tool1',
                argsTextDelta: 'test',
              },
              {
                type: 'tool-call-delta',
                toolCallId: '1',
                toolCallType: 'function',
                toolName: 'tool1',
                argsTextDelta: '"}',
              },
              {
                type: 'tool-call',
                toolCallId: '1',
                toolCallType: 'function',
                toolName: 'tool1',
                args: `{ "value": "test" }`,
              },
              { type: 'text-delta', textDelta: ' World' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                  promptTokens: 10,
                  completionTokens: 20,
                  totalTokens: 30,
                },
              },
            ]),
          }),
          tools: {
            tool1: {
              parameters: z.object({ value: z.string() }),
              execute: async ({ value }) => `${value}-result`,
            },
          },
          prompt: 'test-input',
          toolCallStreaming: true,
          onChunk(event) {
            result.push(event.chunk);
          },
          experimental_transform: upperCaseTransform(),
        });

        await resultObject.consumeStream();

        expect(result).toStrictEqual([
          { type: 'text-delta', textDelta: 'HELLO' },
          {
            type: 'reasoning',
            textDelta: 'Feeling clever',
          },
          {
            type: 'tool-call-streaming-start',
            toolCallId: '1',
            toolName: 'tool1',
          },
          {
            type: 'tool-call-delta',
            argsTextDelta: '{"VALUE": "',
            toolCallId: '1',
            toolName: 'tool1',
          },
          {
            type: 'tool-call-delta',
            argsTextDelta: 'TEST',
            toolCallId: '1',
            toolName: 'tool1',
          },
          {
            type: 'tool-call-delta',
            argsTextDelta: '"}',
            toolCallId: '1',
            toolName: 'tool1',
          },
          {
            type: 'tool-call',
            toolCallId: '1',
            toolName: 'tool1',
            args: { value: 'TEST' },
          },
          {
            type: 'tool-result',
            toolCallId: '1',
            toolName: 'tool1',
            args: { value: 'TEST' },
            result: 'TEST-RESULT',
          },
          { type: 'text-delta', textDelta: ' WORLD' },
        ]);
      });
    });

    describe('with multiple transformations', () => {
      const toUppercaseAndAddCommaTransform =
        <TOOLS extends ToolSet>() =>
        (options: { tools: TOOLS }) =>
          new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
            transform(chunk, controller) {
              if (chunk.type !== 'text-delta') {
                controller.enqueue(chunk);
                return;
              }

              controller.enqueue({
                ...chunk,
                textDelta: `${chunk.textDelta.toUpperCase()},`,
              });
            },
          });

      const omitCommaTransform =
        <TOOLS extends ToolSet>() =>
        (options: { tools: TOOLS }) =>
          new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
            transform(chunk, controller) {
              if (chunk.type !== 'text-delta') {
                controller.enqueue(chunk);
                return;
              }

              controller.enqueue({
                ...chunk,
                textDelta: chunk.textDelta.replaceAll(',', ''),
              });
            },
          });

      it('should transform the stream', async () => {
        const result = streamText({
          model: createTestModel(),
          experimental_transform: [
            toUppercaseAndAddCommaTransform(),
            omitCommaTransform(),
          ],
          prompt: 'test-input',
        });

        expect(
          await convertAsyncIterableToArray(result.textStream),
        ).toStrictEqual(['HELLO', ' ', 'WORLD!']);
      });
    });

    describe('with transformation that aborts stream', () => {
      const stopWordTransform =
        <TOOLS extends ToolSet>() =>
        ({ stopStream }: { stopStream: () => void }) =>
          new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
            // note: this is a simplified transformation for testing;
            // in a real-world version more there would need to be
            // stream buffering and scanning to correctly emit prior text
            // and to detect all STOP occurrences.
            transform(chunk, controller) {
              if (chunk.type !== 'text-delta') {
                controller.enqueue(chunk);
                return;
              }

              if (chunk.textDelta.includes('STOP')) {
                stopStream();

                controller.enqueue({
                  type: 'step-finish',
                  messageId: 'msg-transformed-123',
                  finishReason: 'stop',
                  logprobs: undefined,
                  providerMetadata: undefined,
                  usage: {
                    completionTokens: NaN,
                    promptTokens: NaN,
                    totalTokens: NaN,
                  },
                  request: {},
                  response: {
                    id: 'response-id',
                    modelId: 'mock-model-id',
                    timestamp: new Date(0),
                  },
                  warnings: [],
                  isContinued: false,
                });

                controller.enqueue({
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  providerMetadata: undefined,
                  usage: {
                    completionTokens: NaN,
                    promptTokens: NaN,
                    totalTokens: NaN,
                  },
                  response: {
                    id: 'response-id',
                    modelId: 'mock-model-id',
                    timestamp: new Date(0),
                  },
                });

                return;
              }

              controller.enqueue(chunk);
            },
          });

      it('stream should stop when STOP token is encountered', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello, ' },
              { type: 'text-delta', textDelta: 'STOP' },
              { type: 'text-delta', textDelta: ' World' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: {
                  completionTokens: NaN,
                  promptTokens: NaN,
                  totalTokens: NaN,
                },
              },
            ]),
          }),
          prompt: 'test-input',
          experimental_transform: stopWordTransform(),
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });

        expect(
          await convertAsyncIterableToArray(result.fullStream),
        ).toStrictEqual([
          {
            type: 'step-start',
            messageId: 'msg-0',
            request: {},
            warnings: [],
          },
          { type: 'text-delta', textDelta: 'Hello, ' },
          {
            type: 'step-finish',
            providerMetadata: undefined,
            messageId: 'msg-transformed-123',
            finishReason: 'stop',
            logprobs: undefined,
            usage: {
              completionTokens: NaN,
              promptTokens: NaN,
              totalTokens: NaN,
            },
            request: {},
            response: {
              id: 'response-id',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            warnings: [],
            isContinued: false,
          },
          {
            type: 'finish',
            providerMetadata: undefined,
            finishReason: 'stop',
            logprobs: undefined,
            usage: {
              completionTokens: NaN,
              promptTokens: NaN,
              totalTokens: NaN,
            },
            response: {
              id: 'response-id',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
          },
        ]);
      });

      it('options.onStepFinish should be called', async () => {
        let result!: Parameters<
          Required<Parameters<typeof streamText>[0]>['onStepFinish']
        >[0];

        const resultObject = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello, ' },
              { type: 'text-delta', textDelta: 'STOP' },
              { type: 'text-delta', textDelta: ' World' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: {
                  completionTokens: 10,
                  promptTokens: 3,
                  totalTokens: 13,
                },
              },
            ]),
          }),
          prompt: 'test-input',
          onStepFinish: async event => {
            result = event as unknown as typeof result;
          },
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
          experimental_transform: stopWordTransform(),
        });

        await resultObject.consumeStream();

        expect(result).toMatchSnapshot();
      });
    });
  });

  describe('options.output', () => {
    describe('no output', () => {
      it('should throw error when accessing partial output stream', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"value": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world` },
              { type: 'text-delta', textDelta: `!"` },
              { type: 'text-delta', textDelta: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
          }),
          prompt: 'prompt',
        });

        await expect(async () => {
          await convertAsyncIterableToArray(
            result.experimental_partialOutputStream,
          );
        }).rejects.toThrow('No output specified');
      });
    });

    describe('text output', () => {
      it('should send partial output stream', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello, ' },
              { type: 'text-delta', textDelta: ',' },
              { type: 'text-delta', textDelta: ' world!' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
          }),
          experimental_output: text(),
          prompt: 'prompt',
        });

        expect(
          await convertAsyncIterableToArray(
            result.experimental_partialOutputStream,
          ),
        ).toStrictEqual(['Hello, ', 'Hello, ,', 'Hello, , world!']);
      });
    });

    describe('object output', () => {
      it('should set responseFormat to json and send schema as part of the responseFormat', async () => {
        let callOptions!: LanguageModelV1CallOptions;

        const result = streamText({
          model: new MockLanguageModelV1({
            supportsStructuredOutputs: false,
            doStream: async args => {
              callOptions = args;
              return {
                stream: convertArrayToReadableStream([
                  { type: 'text-delta', textDelta: '{ ' },
                  { type: 'text-delta', textDelta: '"value": ' },
                  { type: 'text-delta', textDelta: `"Hello, ` },
                  { type: 'text-delta', textDelta: `world` },
                  { type: 'text-delta', textDelta: `!"` },
                  { type: 'text-delta', textDelta: ' }' },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { completionTokens: 10, promptTokens: 3 },
                  },
                ]),
                rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              };
            },
          }),
          experimental_output: object({
            schema: z.object({ value: z.string() }),
          }),
          prompt: 'prompt',
        });

        await result.consumeStream();

        expect(callOptions).toEqual({
          temperature: 0,
          mode: { type: 'regular' },
          inputFormat: 'prompt',
          responseFormat: { type: 'json', schema: undefined },
          prompt: [
            {
              content:
                'JSON schema:\n' +
                '{"type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}\n' +
                'You MUST answer with a JSON object that matches the JSON schema above.',
              role: 'system',
            },
            {
              content: [{ text: 'prompt', type: 'text' }],
              providerMetadata: undefined,
              role: 'user',
            },
          ],
        });
      });

      it('should send valid partial text fragments', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"value": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world` },
              { type: 'text-delta', textDelta: `!"` },
              { type: 'text-delta', textDelta: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
          }),
          experimental_output: object({
            schema: z.object({ value: z.string() }),
          }),
          prompt: 'prompt',
        });

        expect(
          await convertAsyncIterableToArray(result.textStream),
        ).toStrictEqual([
          `{ `,
          // key difference: need to combine after `:`
          `"value": "Hello, `,
          `world`,
          `!"`,
          ` }`,
        ]);
      });

      it('should send partial output stream', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"value": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world` },
              { type: 'text-delta', textDelta: `!"` },
              { type: 'text-delta', textDelta: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
          }),
          experimental_output: object({
            schema: z.object({ value: z.string() }),
          }),
          prompt: 'prompt',
        });

        expect(
          await convertAsyncIterableToArray(
            result.experimental_partialOutputStream,
          ),
        ).toStrictEqual([
          {},
          { value: 'Hello, ' },
          { value: 'Hello, world' },
          { value: 'Hello, world!' },
        ]);
      });

      it('should send partial output stream when last chunk contains content', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"value": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world!" }` },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
          }),
          experimental_output: object({
            schema: z.object({ value: z.string() }),
          }),
          prompt: 'prompt',
        });

        expect(
          await convertAsyncIterableToArray(
            result.experimental_partialOutputStream,
          ),
        ).toStrictEqual([{}, { value: 'Hello, ' }, { value: 'Hello, world!' }]);
      });

      it('should resolve text promise with the correct content', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"value": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world!" ` },
              { type: 'text-delta', textDelta: '}' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
          }),
          experimental_output: object({
            schema: z.object({ value: z.string() }),
          }),
          prompt: 'prompt',
        });

        result.consumeStream();

        expect(await result.text).toStrictEqual('{ "value": "Hello, world!" }');
      });

      it('should call onFinish with the correct content', async () => {
        let result!: Parameters<
          Required<Parameters<typeof streamText>[0]>['onFinish']
        >[0];

        const resultObject = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"value": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world!" ` },
              { type: 'text-delta', textDelta: '}' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
          }),
          experimental_output: object({
            schema: z.object({ value: z.string() }),
          }),
          prompt: 'prompt',
          onFinish: async event => {
            result = event as unknown as typeof result;
          },
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
          _internal: {
            generateId: mockId({ prefix: 'id' }),
            currentDate: () => new Date(0),
          },
        });

        resultObject.consumeStream();

        await resultObject.consumeStream();

        expect(result).toMatchSnapshot();
      });
    });
  });
});
